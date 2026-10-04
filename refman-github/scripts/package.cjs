'use strict';
const path = require('node:path');
const { packager } = require('@electron/packager');
packager({dir:path.resolve(__dirname,'..'),name:'Refman',platform:'darwin',arch:'arm64',out:path.resolve(__dirname,'../dist'),overwrite:true,asar:{unpack:'**/vendor/**'},icon:path.resolve(__dirname,'../assets/Refman.icns'),appBundleId:'app.refman.desktop',extendInfo:path.resolve(__dirname,'../assets/Info-extra.plist'),ignore:/^\/(tests|docs|dist|work)(\/|$)/}).then(paths=>console.log(paths.join('\n'))).catch(error=>{console.error(error);process.exitCode=1;});
