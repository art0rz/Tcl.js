/*
 RequireJS text 2.0.4 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 Available via the MIT or new BSD license.
 see: http://github.com/requirejs/text for details
*/
define(["module"],function(k){var f,l,m=["Msxml2.XMLHTTP","Microsoft.XMLHTTP","Msxml2.XMLHTTP.4.0"],o=/^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,p=/<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,h="undefined"!==typeof location&&location.href,q=h&&location.protocol&&location.protocol.replace(/\:/,""),r=h&&location.hostname,s=h&&(location.port||void 0),j=[],g=k.config&&k.config()||{};f={version:"2.0.4",strip:function(a){if(a){var a=a.replace(o,""),c=a.match(p);c&&(a=c[1])}else a="";return a},
jsEscape:function(a){return a.replace(/(['\\])/g,"\\$1").replace(/[\f]/g,"\\f").replace(/[\b]/g,"\\b").replace(/[\n]/g,"\\n").replace(/[\t]/g,"\\t").replace(/[\r]/g,"\\r").replace(/[\u2028]/g,"\\u2028").replace(/[\u2029]/g,"\\u2029")},createXhr:g.createXhr||function(){var a,c,d;if("undefined"!==typeof XMLHttpRequest)return new XMLHttpRequest;if("undefined"!==typeof ActiveXObject)for(c=0;3>c;c+=1){d=m[c];try{a=new ActiveXObject(d)}catch(e){}if(a){m=[d];break}}return a},parseName:function(a){var c,
d,e=!1,b=a.indexOf(".");c=0===a.indexOf("./")||0===a.indexOf("../");-1!==b&&(!c||1<b)?(c=a.substring(0,b),d=a.substring(b+1,a.length)):c=a;a=d||c;b=a.indexOf("!");-1!==b&&(e="strip"===a.substring(b+1),a=a.substring(0,b),d?d=a:c=a);return{moduleName:c,ext:d,strip:e}},xdRegExp:/^((\w+)\:)?\/\/([^\/\\]+)/,useXhr:function(a,c,d,e){var b,g;b=f.xdRegExp.exec(a);if(!b)return!0;a=b[2];b=b[3];b=b.split(":");g=b[1];b=b[0];return(!a||a===c)&&(!b||b.toLowerCase()===d.toLowerCase())&&(!g&&!b||g===e)},finishLoad:function(a,
c,d,e){d=c?f.strip(d):d;g.isBuild&&(j[a]=d);e(d)},load:function(a,c,d,e){if(e.isBuild&&!e.inlineText)d();else{g.isBuild=e.isBuild;var b=f.parseName(a),e=b.moduleName+(b.ext?"."+b.ext:""),n=c.toUrl(e),i=g.useXhr||f.useXhr;!h||i(n,q,r,s)?f.get(n,function(c){f.finishLoad(a,b.strip,c,d)},function(a){d.error&&d.error(a)}):c([e],function(a){f.finishLoad(b.moduleName+"."+b.ext,b.strip,a,d)})}},write:function(a,c,d){if(j.hasOwnProperty(c)){var e=f.jsEscape(j[c]);d.asModule(a+"!"+c,"define(function () { return '"+
e+"';});\n")}},writeFile:function(a,c,d,e,b){var c=f.parseName(c),g=c.ext?"."+c.ext:"",i=c.moduleName+g,h=d.toUrl(c.moduleName+g)+".js";f.load(i,d,function(){var c=function(a){return e(h,a)};c.asModule=function(a,b){return e.asModule(a,h,b)};f.write(a,i,c,b)},b)}};if("node"===g.env||!g.env&&"undefined"!==typeof process&&process.versions&&process.versions.node)l=require.nodeRequire("fs"),f.get=function(a,c){var d=l.readFileSync(a,"utf8");0===d.indexOf("\ufeff")&&(d=d.substring(1));c(d)};else if("xhr"===
g.env||!g.env&&f.createXhr())f.get=function(a,c,d){var e=f.createXhr();e.open("GET",a,!0);if(g.onXhr)g.onXhr(e,a);e.onreadystatechange=function(){var b;4===e.readyState&&(b=e.status,399<b&&600>b?(b=Error(a+" HTTP status: "+b),b.xhr=e,d(b)):c(e.responseText))};e.send(null)};else if("rhino"===g.env||!g.env&&"undefined"!==typeof Packages&&"undefined"!==typeof java)f.get=function(a,c){var d,e,b=new java.io.File(a),g=java.lang.System.getProperty("line.separator"),b=new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(b),
"utf-8")),f="";try{d=new java.lang.StringBuffer;(e=b.readLine())&&(e.length()&&65279===e.charAt(0))&&(e=e.substring(1));for(d.append(e);null!==(e=b.readLine());)d.append(g),d.append(e);f=String(d.toString())}finally{b.close()}c(f)};return f});
