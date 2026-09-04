/* Runs inside the browser. Takes a data: URI of a sheet with several drawings on a white
   background and returns one trimmed, transparent PNG+WebP per drawing.

   The background is found by flooding inward from the border rather than by testing each
   pixel for whiteness. That distinction is the whole job: the puffer's belly, the whites of
   its eyes and the highlight in its pupil are all near-white too, and a per-pixel test punches
   holes straight through the fish. Anything the flood cannot reach from outside is fish. */
window.__split = async function(src, opts){
  var TOL = opts.tol || 22;          // how far off pure white still counts as background
  var MIN_AREA = opts.minArea || 900; // drops arrows, captions, stray specks
  var PAD = opts.pad || 2;

  var img = new Image();
  await new Promise(function(res, rej){ img.onload = res; img.onerror = rej; img.src = src; });
  var W = img.naturalWidth, H = img.naturalHeight;
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  var d = g.getImageData(0, 0, W, H), px = d.data;

  function nearWhite(i){ return px[i] >= 255-TOL && px[i+1] >= 255-TOL && px[i+2] >= 255-TOL; }

  // 1. flood the background inward from every border pixel
  var bg = new Uint8Array(W*H), stack = [];
  for(var x=0; x<W; x++){ stack.push(x, x + (H-1)*W); }
  for(var y=0; y<H; y++){ stack.push(y*W, y*W + W-1); }
  while(stack.length){
    var p = stack.pop();
    if(bg[p]) continue;
    if(!nearWhite(p*4)) continue;
    bg[p] = 1;
    var py = (p/W)|0, pxx = p - py*W;
    if(pxx>0) stack.push(p-1);
    if(pxx<W-1) stack.push(p+1);
    if(py>0) stack.push(p-W);
    if(py<H-1) stack.push(p+W);
  }

  // 2. label what the flood could not reach — one label per drawing
  var lab = new Int32Array(W*H).fill(-1), blobs = [], n = 0;
  for(var s=0; s<W*H; s++){
    if(bg[s] || lab[s] >= 0) continue;
    var id = n++, area = 0, x0=1e9, y0=1e9, x1=-1, y1=-1, st = [s];
    lab[s] = id;
    while(st.length){
      var q = st.pop(); area++;
      var qy = (q/W)|0, qx = q - qy*W;
      if(qx<x0)x0=qx; if(qx>x1)x1=qx; if(qy<y0)y0=qy; if(qy>y1)y1=qy;
      // 8-connected: a hairline spine touching the body only at a corner is still the same fish
      for(var dy=-1; dy<=1; dy++) for(var dx=-1; dx<=1; dx++){
        var nx = qx+dx, ny = qy+dy;
        if(nx<0||ny<0||nx>=W||ny>=H) continue;
        var r = ny*W+nx;
        if(bg[r] || lab[r] >= 0) continue;
        lab[r] = id; st.push(r);
      }
    }
    blobs.push({ id: id, area: area, x0: x0, y0: y0, x1: x1, y1: y1 });
  }

  /* 3. keep the real drawings, left to right. An area threshold alone is a guess about a
        sheet nobody has seen yet -- on the real puffer sheet the arrows between the stages
        came to 1367 pixels of ink, comfortably over any threshold small enough to be safe.
        When the caller says how many drawings there are, take that many largest and let the
        arrows fall off the end; the threshold is only the fallback. */
  var keep = blobs.filter(function(b){ return b.area >= MIN_AREA; });
  if(opts.count > 0){
    keep = keep.sort(function(a,b){ return b.area - a.area; }).slice(0, opts.count);
  }
  keep = keep.sort(function(a,b){ return a.x0 - b.x0; });

  // 4. cut each one out. Inside its own label: opaque. Touching it from the background side:
  //    alpha from how dark the pixel is, which keeps the drawn outline's anti-aliasing instead
  //    of leaving it a hard stair-stepped edge.
  var out = [];
  for(var k=0; k<keep.length; k++){
    var b = keep[k];
    var bx = Math.max(0, b.x0-PAD), by = Math.max(0, b.y0-PAD);
    var bw = Math.min(W-1, b.x1+PAD) - bx + 1, bh = Math.min(H-1, b.y1+PAD) - by + 1;
    var oc = document.createElement('canvas'); oc.width = bw; oc.height = bh;
    var og = oc.getContext('2d');
    var od = og.createImageData(bw, bh), op = od.data;
    for(var yy=0; yy<bh; yy++) for(var xx=0; xx<bw; xx++){
      var srcI = ((by+yy)*W + (bx+xx));
      var o = (yy*bw + xx)*4, i4 = srcI*4;
      op[o]=px[i4]; op[o+1]=px[i4+1]; op[o+2]=px[i4+2];
      if(lab[srcI] === b.id){ op[o+3] = 255; continue; }
      if(lab[srcI] >= 0){ op[o+3] = 0; continue; }   // a different drawing bleeding into this box
      // background pixel: keep only the part of the outline's feather that belongs to us
      var touches = false;
      for(var dy2=-1; dy2<=1 && !touches; dy2++) for(var dx2=-1; dx2<=1; dx2++){
        var nx2 = bx+xx+dx2, ny2 = by+yy+dy2;
        if(nx2<0||ny2<0||nx2>=W||ny2>=H) continue;
        if(lab[ny2*W+nx2] === b.id){ touches = true; break; }
      }
      if(!touches){ op[o+3] = 0; continue; }
      var dark = 255 - Math.min(px[i4], px[i4+1], px[i4+2]);
      op[o+3] = Math.max(0, Math.min(255, Math.round(dark * 255 / Math.max(1, TOL*3))));
    }
    og.putImageData(od, 0, 0);

    /* Two finishing passes, both because of where these end up.

       `flip`: drawFish sways the right-hand end of its source hardest, because the betta and
       the clownfish both face left. A sprite drawn facing right would have its FACE wagging
       and its tail held rigid, so a right-facing sheet is mirrored once here rather than
       special-cased in the draw loop forever.

       `maxW`: the jellyfish is drawn about 33 pixels wide and arrived 792 across -- 221 KB of
       WebP for something the size of a fingernail, on a file every shopper downloads. */
    var fc = oc, fw2 = bw, fh2 = bh;
    var scale = opts.maxW ? Math.min(1, opts.maxW / bw) : 1;
    if(scale < 1 || opts.flip){
      fw2 = Math.max(1, Math.round(bw * scale));
      fh2 = Math.max(1, Math.round(bh * scale));
      fc = document.createElement('canvas'); fc.width = fw2; fc.height = fh2;
      var fg = fc.getContext('2d');
      fg.imageSmoothingQuality = 'high';
      if(opts.flip){ fg.translate(fw2, 0); fg.scale(-1, 1); }
      fg.drawImage(oc, 0, 0, fw2, fh2);
    }
    out.push({ w: fw2, h: fh2, area: b.area,
               png: fc.toDataURL('image/png'),
               webp: fc.toDataURL('image/webp', 0.92) });
  }
  return { width: W, height: H, blobs: blobs.length, kept: out.length, sprites: out };
};
