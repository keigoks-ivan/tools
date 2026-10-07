if(new URLSearchParams(location.search).get('mode')==='free'){
  document.getElementById('game').hidden=false;
  import('./game.js?v=7');
}else{
  document.body.classList.add('recipe-mode');
  document.getElementById('recipe').hidden=false;
  import('./recipe-game.js?v=9');
}
