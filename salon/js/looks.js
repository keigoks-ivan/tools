import {guest,palette} from './data.js?v=18';
export const guests=[
 {...guest,id:'cocoa',hair:{...guest.hair}},
 {...guest,id:'honey',skin:'#c68b68',atlas:'./assets/art/guest-honey.webp',hair:{length:275,part:.57,bangs:false,color:[77,46,38]}},
 {...guest,id:'peach',skin:'#ffccb3',artOffsets:{blink:5,happy:36,surprise:36},atlas:'./assets/art/guest-peach.webp',hair:{length:335,part:.42,bangs:true,color:[216,155,81]}}
];
export const accessories=['bow','flower','star','butterfly','heart','moon','crown','pearls'];
export const wishes=[
 {id:'rose',colors:[0,5],length:.8,accessory:'bow',paper:'#fbe2ec'},
 {id:'ocean',colors:[4,3],length:1,accessory:'pearls',paper:'#dff2f0'},
 {id:'sunshine',colors:[2,1],length:.55,accessory:'flower',paper:'#fff0cf'},
 {id:'rainbow',colors:[0,1,2,3,4,5],length:1,accessory:'star',paper:'#ede5f8'},
 {id:'moon',colors:[5,4],length:.68,accessory:'moon',paper:'#e5e9fb'},
 {id:'peach',colors:[1,0],length:.85,accessory:'butterfly',paper:'#ffe4d6'}
];
export const rgb=i=>`rgb(${palette[i%palette.length].join(',')})`;
