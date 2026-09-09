(function () {
  try {
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
