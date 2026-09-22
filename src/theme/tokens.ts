export const colors = {
  background: '#FCF8F1', backgroundMuted: '#F3E8D8', surface: '#FFFCF8', surfaceAlt: '#FAF2E7',
  paper: '#FFFCF7', paperWarm: '#FFF4E3', border: '#F0E3D2', borderStrong: '#C6A887',
  textPrimary: '#32271D', textSecondary: '#746558', textMuted: '#A89B8E',
  brand: '#FFA019', brandStrong: '#FF7B08', brandDeep: '#FF6504', brandSoft: '#FFF0DA',
  success: '#83AE57', successSoft: '#EAF0DE', warning: '#E9B54E', warningSoft: '#FFF5DE',
  danger: '#E7827F', dangerSoft: '#FCECE9', shadow: 'rgba(103,63,23,0.12)', shadowSoft: 'rgba(90,55,21,0.05)',
  blue: '#87A1B8', green: '#829D50', brown: '#AE8666', red: '#EC8880', black: '#29241F', white: '#FFFFFF',
} as const;
export const spacing = { xs:4, sm:8, md:12, lg:16, xl:20, xxl:24, xxxl:32, xxxxl:40 } as const;
export const radius = {xs:6, sm:10, md:14, lg:20, xl:28, pill:999} as const;
export const shadow = {
 card:{shadowColor:'#805528',shadowOpacity:0.07,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:2},
 soft:{shadowColor:'#805528',shadowOpacity:0.045,shadowRadius:5,shadowOffset:{width:0,height:2},elevation:1},
} as const;
export const typography = {hero:30,title:26,heading:21,subheading:16,body:14,caption:12,meta:10} as const;
export const layout = {maxWidth:480,bottomBarHeight:68,screenEdge:18} as const;
export const photoPalette = ['#ffd9c9','#ffeab6','#d6f0de','#d9edff','#f2defa','#ffe0eb'] as const;
