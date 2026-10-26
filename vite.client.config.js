import {defineConfig} from 'vite';
export default defineConfig({
  build:{
    target:'es2022',outDir:'dist-client',minify:false,
    lib:{entry:'src/client.jsx',formats:['cjs'],fileName:()=> 'client.js'},
    rolldownOptions:{
      external:['react','react-dom','react/jsx-runtime'],
      output:{
        banner:"window.__ModuleLoader__.load({id:'ds-project',factory:(require)=>{const module={exports:{}};const exports=module.exports;",
        footer:"return module.exports;}});"
      }
    }
  }
});
