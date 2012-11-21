/*jslint plusplus: true, white: true, nomen: true, regexp: true */
/*global define */

define([
	'./ex_callframes',
	'./ex_control_cmds',
	'./ex_list_cmds',
	'./ex_dict_cmds',
	'./ex_string_cmds',
	'./types',
	'./objtype_int'
], function(
	ex_callframes,
	ex_control_cmds,
	ex_list_cmds,
	ex_dict_cmds,
	ex_string_cmds,
	types,
	IntObj
){
'use strict';

var TclResult = types.TclResult;

function install(interp) {
	if (interp.register_extension('ex_core_cmds')) {return;}

	/* Core commands still to implement:
	 after append apply array binary clock coroutine format global info interp
	 namespace package regexp regsub rename scan subst tailcall time trace
	 update uplevel upvar variable vwait yield zlib
	 */

	interp.registerCommand('set', function(args){
		interp.checkArgs(args, [1, 2], 'varName ?newValue?');
		if (args.length === 2) {
			return interp.get_var(args[1]);
		}
		return interp.set_var(args[1], args[2]);
	});

	interp.registerCommand('unset', function(args){
		var eating_args = true, report_errors = true, i;
		while (eating_args && args.length > 0) {
			switch (args[0].toString()) {
				case '-nocomplain': report_errors = false; args.shift(); break;
				case '--': eating_args = false; args.shift(); break;
			}
		}
		for (i=0; i<args.length; i++) {
			interp.unset_var(args[i], report_errors);
		}
	});

	interp.registerAsyncCommand('catch', function(c, args){
		interp.checkArgs(args, [1, 3], 'script ?resultVarName? ?optionsVarName?');
		var resultvar = args[2], optionsvar = args[3];
		return interp.exec(args[1], function(res){
			if (resultvar !== undefined) {
				interp.set_var(resultvar, res.result);
			}
			if (optionsvar !== undefined) {
				interp.set_var(optionsvar, res.options);
			}
			return c(new IntObj(res.code));
		});
	});

	interp.registerCommand('expr', function(args){
		interp.checkArgs(args, [1, null], 'arg ?arg ...?');
		if (args.length === 2) {
			return interp.TclExpr(args[1]);
		}
		var i, str_args = [];
		for (i=1; i<args.length; i++) {
			str_args.push(args.toString());
		}
		return interp.TclExpr(str_args.join(' '));
	});

	interp.registerCommand('incr', function(args){
		interp.checkArgs(args, [1, 2], 'varname ?increment?');
		var intobj = interp.get_var(args[1], true),
			increment = args[2] === undefined ? 1 : args[2].GetInt();
		intobj.jsval = intobj.GetInt() + increment;
		intobj.InvalidateCaches();
		return intobj;
	});

	interp.registerCommand('return', function(args){
		interp.checkArgs(args, [0, null], '?value?');
		var i, k, v, options = [], code = types.RETURN, value, level;

		if (args.length % 2 === 1) {
			value = args.pop();
		} else {
			value = types.EmptyString;
		}
		while (i<args.length) {
			k = args[i++]; v = args[i++];
			options.push(k, v);
			if (k === '-code') {
				if (interp.str_return_codes[v] !== undefined) {
					code = interp.str_return_codes[v];
				} else {
					code = v;
				}
			} else if (k === '-level') {
				level = v;
			}
		}
		if (level === undefined) {
			options.push('-level', types.IntOne);
		}
		return new TclResult(options.code.GetInt(), value, options);
	});

	interp.registerAsyncCommand('eval', function(c, args){
		var parts = [], i;
		for (i=1; i<args.length; i++) {
			parts.push(/^[ \t\n\r]*(.*?)[ \t\n\r]*$/.exec(args[i].toString())[1]);
		}
		return interp.exec(parts.join(' '), c);
	});

	ex_callframes.install(interp);
	ex_control_cmds.install(interp);
	ex_list_cmds.install(interp);
	ex_dict_cmds.install(interp);
	ex_string_cmds.install(interp);
}

return {'install': install};
});
