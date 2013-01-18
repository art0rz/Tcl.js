Tcl in Javascript
=================

This project is an attempt at a robust, high performance subset of the Tcl language, implemented in Javascript.

Why Tcl in a Browser?
---------------------

I use Tcl extensively as an extension language, or to implement domain specific languages for configuration or defining custom behaviour for business objects.  These Tcl scripts often come from users, so Tcl's safe interpreters provided a nice sandbox for running these scripts.

The market has changed, and no longer wants to install native applications (in Tk, or anything else for that matter), particularly in an enterprise environment.  To address this we moved our frontend application to Javascript in a browser, which also extends the reach to mobile devices.  But the frontend still needs to support all the existing DSL code, and rewriting it in Javascript wouldn't solve it because running untrusted Javascript scripts in the browser (via eval or new Function) is an unaceptable security and stability risk.  This interpreter addresses both these concerns.

Why Another One?
----------------

There are several other implementations of Tcl in Javascript, ranging from the toy level (around 1000 lines of js) to the behemoth.  I needed something a bit different from all the existing implementations:
* Pedantically correct syntax parsing (list, script and expressions), to the extent possible in Javascript.
* Production grade - enterprise frameworks rely on the code working the same as it did on a native Tcl/Tk frontend.
* Sufficiently fast - it needs to run some pretty hot code, like realtime filters and transforms on datasets with tens of thousands of rows.
* As small as possible - since the whole codebase is downloaded at least once (even assuming caching works properly), the size over the wire should be as small as possible.
* Modular - to further address the above goal, the interpreter should be modular, allowing only those features that are needed to be loaded.
* Built as AMD modules (loadable with RequireJS or Dojo).
* Support asynchronous commands (so that a javascript handler for a Tcl command can return without providing a result and then supply the result later when it is available, at which point the Tcl script continues).
* Targetting version 8.6 (but without TclOO, for now).
* Doesn't eval javascript strings that could be manipulated by external entities (some implementations use this trick to implement expr).  This is an unacceptable security risk for my application.
* Works in all reasonably recent browsers (even IE6 if possible).

This attempt does not completely reach the above goals yet, but it is sufficiently close for my needs, and with time I hope that the supported subset will grow.

What Does It Look Like?
-----------------------

HTML:
```html
<!DOCTYPE html>
<html>
	<head>
		<title>jstcl</title>
		<meta charset="utf-8" />
		<script data-main="main" src="require.js"></script>
	</head>
	<body>
	</body>
</html>
```

main.js:
```javascript
require(['tcl/interp'], function(Interp){
	var I = Interp();

	I.registerCommand('annoy_user', function(args){
		I.checkArgs(args, 1, 'string');
		alert(args[1]);
	});

	I.TclEval('annoy_user "hello, world"', function(result){
		switch (result.code) {
			case I.types.OK:
			case I.types.RETURN:
				break;
			case I.types.ERROR:
				console.warn('Uncaught error in Tcl script: '+result.result);
				break;
			default:
				console.warn('Unexpected return code from Tcl script: '+result.code);
		}
	});
});
```

How Fast Is It?
---------------

The performance relative to a native Tcl interpreter will vary widely depending on which areas of the interpreter are stressed, but attempting to measure the command dispatch (and to an extent, expression evaluation and variable accesses), the following code:

```tcl
for {set i 0} {$i < 10000} {incr i} {nop}
```

With `nop` implemented in native Tcl as:

```tcl
proc nop args {}
```

and in jstcl as:

```javascript
var I = Interp();
I.registerCommand('nop', function(){
	return I.EmptyResult;
});
```

The timings are as follows (on my MacBook Air with a Core i5 @ 1.8GHz):

* Native Tcl 8.6, not in bytecoded context: 7765 microseconds per iteration
* Native Tcl 8.6, in bytecoded context (using `apply`): 6508 microseconds per iteration
* jstcl (bytecode context N/A) on V8 (Google Chrome 24): 57967 microseconds per iteration

So it's around an order of magnitude slower than native, but I expect that there is about a 25% improvement remaining to be gained with reasonable effort.

What Is The License?
--------------------

jstcl is copyright Cyan Ogilvie, and licensed under the same terms as Tcl.  (BSD-ish)

Why Are All The Headings Questions?
-----------------------------------

I don't know.  It bothers me also.
