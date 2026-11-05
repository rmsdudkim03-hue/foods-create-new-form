// 조형 평면 그림(SVG)을 3D와 상관없이 바로 그려 넣음 (일반 스크립트 — 3D 모듈이 늦거나 못 떠도 그림은 보이게)
//  예전엔 hover3d.js가 3D 파일을 준비하면서 SVG를 넣어서, 느린 컴퓨터(2012 아이맥)에선 조형이 하나씩 늦게 나타나거나
//  3D가 실패하면 히스토리 마지막 장(Create form)이 비어 보였음
//  - <figure class="form3d" data-svg=…> 마다 SVG를 넣고, data-fit이면 여백을 잘라 칸에 꽉 채움
//  - 3D가 있는 조형(data-model)은 3D와 같은 색으로 미리 칠함 (바뀔 때 색이 튀지 않게, hover3d.js의 MATERIALS와 같은 색)
//  - hover3d.js는 window.FORM2D(el)로 이미 넣은 그림을 받아 씀
(() => {
  const COLORS = { 'pantone-602c': '#E9D862', porcelain: '#f4f2ed', 'matte-white': '#eeece6', cream: '#e9e2d3' };   // svg-* 질감은 SVG 원래 색
  const DEFAULT = 'pantone-602c';
  function prep(el) {
    if (el._svg2d) return el._svg2d;
    el._svg2d = (async () => {
      const text = await (await fetch(el.dataset.svg)).text();
      const holder = document.createElement('div');
      holder.className = 'form3d-svg';
      holder.innerHTML = text;
      const svg = holder.querySelector('svg');
      svg.removeAttribute('width'); svg.removeAttribute('height');
      el.prepend(holder);
      const shape = svg.querySelector('path, polygon, rect, circle, ellipse');
      const box = shape.getBBox();                                  // SVG 안에서 모양이 차지하는 칸
      if ('fit' in el.dataset) svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
      el.style.setProperty('--ar', (box.width / box.height).toFixed(4));
      if (el.dataset.model && !('keepSvgColor' in el.dataset)) {
        const c = el.dataset.color || COLORS[el.dataset.material || DEFAULT];
        if (c) shape.setAttribute('fill', c);
      }
      if (!el.dataset.model) el.classList.add('ready');
      return holder;
    })();
    return el._svg2d;
  }
  window.FORM2D = prep;
  document.querySelectorAll('.form3d[data-svg]').forEach((el) => prep(el).catch((e) => console.warn('조형 그림을 못 불러왔어요', e)));
})();
