export function traceTree(tree,start='all',target=null){
  const forward=new Set(),backward=new Set();
  const visit=(id,set,direction)=>{if(set.has(id))return;set.add(id);for(const edge of tree.edges)if(edge[direction==='forward'?'from':'to']===id)visit(edge[direction==='forward'?'to':'from'],set,direction);};
  if(start==='all')tree.nodes.forEach(node=>forward.add(node.id));else visit(start,forward,'forward');
  if(target)visit(target,backward,'backward');else tree.nodes.forEach(node=>backward.add(node.id));
  const nodes=new Set([...forward].filter(id=>backward.has(id)));
  const edges=tree.edges.filter(edge=>nodes.has(edge.from)&&nodes.has(edge.to)).map(edge=>edge.id);
  return {nodes,edges:new Set(edges),connected:!target||nodes.has(target)};
}

export function validateTree(tree){
  const ids=new Set(tree.nodes.map(node=>node.id)),edgeIds=new Set();
  if(ids.size!==tree.nodes.length)throw new Error('重複節點');
  const done=new Set(),active=new Set();
  for(const edge of tree.edges){if(!ids.has(edge.from)||!ids.has(edge.to))throw new Error('連線缺少節點');if(edgeIds.has(edge.id))throw new Error('重複連線');edgeIds.add(edge.id);}
  const walk=id=>{if(active.has(id))throw new Error('路線不能循環取得同一會籍');if(done.has(id))return;active.add(id);tree.edges.filter(edge=>edge.from===id).forEach(edge=>walk(edge.to));active.delete(id);done.add(id);};
  tree.nodes.forEach(node=>walk(node.id));return true;
}

export function treePosition(tree,scale=1,offset={x:0,y:0}){
  const zoom=Math.max(.65,Math.min(2.6,Number.isFinite(scale)?scale:1));
  const width=tree.width/zoom,height=tree.height/zoom;
  const limit=(value,max)=>Number.isFinite(value)?Math.max(-max,Math.min(max,value)):0;
  return {x:(tree.width-width)/2+limit(offset.x,tree.width),y:(tree.height-height)/2+limit(offset.y,tree.height),width,height,zoom};
}
