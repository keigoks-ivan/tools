if(new URLSearchParams(location.search).get('mode')==='legacy'){
  document.getElementById('game').hidden=false;
  import('./game.js?v=7');
}else if(new URLSearchParams(location.search).get('mode')==='recipe'){
  document.body.classList.add('recipe-mode');
  document.getElementById('recipe').hidden=false;
  import('./recipe-game.js?v=10');
}else{
  document.body.classList.add('play-mode');
  document.getElementById('play').hidden=false;
  import('./play-game.js?v=11');
}
