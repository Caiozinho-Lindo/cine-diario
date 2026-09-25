(function () {
  try {
    if (sessionStorage.getItem('cine_diario_navegacao_interna') === '1') {
      sessionStorage.removeItem('cine_diario_navegacao_interna');
      document.body.classList.add('app-navigation');
      document.addEventListener('DOMContentLoaded', function () {
        var navbar = document.getElementById('navbar');
        var snapshot = sessionStorage.getItem('cine_diario_nav_snapshot');
        sessionStorage.removeItem('cine_diario_nav_snapshot');
        if (navbar && snapshot && !navbar.children.length) {
          navbar.innerHTML = snapshot;
          navbar.classList.add('navbar-snapshot');
        }
      }, { once: true });
    }

    var tema = localStorage.getItem('cine_diario_tema_inicial');
    if (!tema) return;

    var equivalencias = { caio: 'azul', noemy: 'lavanda', casal: 'cinema' };
    var permitidos = [
      'cinema',
      'azul',
      'lavanda',
      'claro',
      'noir',
      'aranha',
      'matrix',
      'classico',
      'chefao',
      'tubarao',
      'star-wars'
    ];

    tema = equivalencias[tema] || tema;
    if (!permitidos.includes(tema)) return;

    document.body.className = document.body.className
      .replace(/\btheme-[^\s]+/g, '')
      .trim();
    document.body.classList.add('theme-' + tema);
  } catch (error) {
    // O perfil ainda aplica o tema salvo no Supabase depois do carregamento.
  }
})();
