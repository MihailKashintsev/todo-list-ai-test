const ease = 'cubic-bezier(0.23, 1, 0.32, 1)';
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Transient, inert visual copy: real data and the accessible list update immediately.
export function dissolve(element) {
  if (!element || reducedMotion() || !element.animate) return;
  const box = element.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'dissolve-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  const ghost = element.cloneNode(true);
  ghost.classList.add('task-ghost');
  Object.assign(ghost.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  layer.append(ghost);
  const animations = [ghost.animate([
    { opacity: .9, transform: 'scale(1)' },
    { opacity: 0, transform: 'translateY(-3px) scale(.98)' }
  ], { duration: 200, easing: ease, fill: 'forwards' })];
  for (let i = 0; i < 28; i++) {
    const particle = document.createElement('span');
    particle.className = 'task-particle';
    const x = box.left + 22 + Math.random() * Math.max(0, box.width - 44);
    const y = box.top + box.height / 2 + (Math.random() - .5) * 20;
    const size = 2 + Math.random() * 4;
    Object.assign(particle.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px`, background: ['#30634c','#8ba079','#c1ceae'][i % 3] });
    layer.append(particle);
    animations.push(particle.animate([
      { opacity: 0, transform: 'translate(0,0) rotate(0deg) scale(1)' },
      { opacity: .8, offset: .15 },
      { opacity: 0, transform: `translate(${(Math.random() - .5) * 65}px,${-18 - Math.random() * 40}px) rotate(${Math.random() * 160 - 80}deg) scale(.4)` }
    ], { duration: 280, delay: i * 2, easing: ease, fill: 'both' }));
  }
  document.body.append(layer);
  Promise.allSettled(animations.map(animation => animation.finished)).then(() => layer.remove());
}
