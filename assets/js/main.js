// Highlights the current slide's dot in the side navigation on the Design page.
document.addEventListener('DOMContentLoaded', () => {
  const slides = document.querySelectorAll('.slide');
  const dots = document.querySelectorAll('.slide-dots a');
  if (!slides.length || !dots.length) return;

  const setActive = (id) => {
    dots.forEach((dot) => {
      dot.classList.toggle('active', dot.getAttribute('href') === `#${id}`);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    },
    { threshold: 0.55 }
  );

  slides.forEach((slide) => observer.observe(slide));
});
