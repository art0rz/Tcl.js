/*jslint plusplus: true, white: true, nomen: true, bitwise: true */
/*global define */

define([
	'./parser',
	'./tclobject',
	'./list',
	'./types',
	'cflib/promise',
	'./objtype_list',
	'./objtype_script',
	'./objtype_expr'
], function(
	parser,
	tclobj,
	list,
	types,
	Promise,
	ListObj,
	ScriptObj,
	ExprObj
){
"use strict";

var TclError = types.TclError,
	TclResult = types.TclResult,
	SCALAR = types.SCALAR,
	ARRAY = types.ARRAY,
	OK = types.OK,
	ERROR = types.ERROR,
	RETURN = types.RETURN,
	BREAK = types.BREAK,
	CONTINUE = types.CONTINUE,
	OPERATOR = parser.OPERATOR,
	OPERAND = parser.OPERAND,
	MATHFUNC = parser.MATHFUNC,
	INTEGER = parser.INTEGER,
	FLOAT = parser.FLOAT,
	BOOL = parser.BOOL,
	QUOTED = parser.QUOTED,
	BRACED = parser.BRACED,
	SCRIPT = parser.SCRIPT,
	EXPR = parser.EXPR,
	VAR = parser.VAR,
	INDEX = parser.INDEX,
	ARG = parser.ARG;

return function(/* extensions... */){
	var args = Array.prototype.slice.call(arguments), i,
		self = this, mathops, mathfuncs;

	this.vars = {};
	this.commands = {};
	this.extensions = {};

	this.resolve_var = function(varname) {
		var vinfo = this.vars[varname];
		if (vinfo === undefined) {
			throw new TclError('can\'t read "'+varname+'": no such variable',
				'TCL', 'LOOKUP', 'VARNAME', varname);
		}
		return vinfo;
	};

	this.var_exists = function(varname) {
		return this.vars[varname] !== undefined;
	};

	this.scalar_exists = function(varname) {
		return	this.vars[varname] !== undefined &&
				this.vars[varname].type === SCALAR;
	};

	this.array_exists = function(varname) {
		return	this.vars[varname] !== undefined &&
				this.vars[varname].type === ARRAY;
	};

	this.get_scalar = function(varname, make_unshared) {
		var vinfo = this.resolve_var(varname), obj;
		if (vinfo.type === ARRAY) {
			throw new TclError('can\'t read "'+varname+'": variable is array',
				'TCL', 'READ', 'VARNAME');
		}
		obj = vinfo.value;
		if (make_unshared && obj.refcount > 1) {
			obj = obj.DuplicateObj();
			vinfo.value = obj;
			obj.IncrRefCount();
		}
		return obj;
	};

	this.get_array = function(array, index, make_unshared) {
		var vinfo = this.resolve_var(array), obj;
		if (vinfo.type !== ARRAY) {
			throw new TclError('can\'t read "'+array+'('+index+')": variable isn\'t array',
				'TCL', 'LOOKUP', 'VARNAME', array);
		}
		if (index !== undefined) {
			if (vinfo.value[index] === undefined) {
				throw new TclError('can\'t read "'+array+'('+index+')": no such element in array',
					'TCL', 'READ', 'VARNAME');
			}
			obj = vinfo.value[index];
			if (make_unshared && obj.refcount > 1) {
				obj = obj.DuplicateObj();
				vinfo.value[index] = obj;
				obj.IncrRefCount();
			}
			return obj;
		}
		return vinfo.value;
	};

	this.set_scalar = function(varname, value) {
		var vinfo = this.vars[varname];
		if (vinfo === undefined) {
			vinfo = this.vars[varname] = {type: SCALAR};
		}
		if (vinfo.type === ARRAY) {
			throw new TclError('can\'t set "'+varname+'": variable is array',
				'TCL', 'WRITE', 'VARNAME');
		}
		if (vinfo.value !== undefined) {
			vinfo.value.DecrRefCount();
		}
		vinfo.value = tclobj.AsObj(value);
		vinfo.value.IncrRefCount();
		return value;
	};

	this.set_array = function(array, index, value) {
		var vinfo = this.vars[array];
		if (vinfo === undefined) {
			vinfo = this.vars[array] = {type: ARRAY, value: {}};
		}
		if (vinfo.type !== ARRAY) {
			throw new TclError('can\'t set "'+array+'('+index+')": variable isn\'t array',
				'TCL', 'LOOKUP', 'VARNAME', array);
		}
		if (index) {
			if (vinfo.value[index] !== undefined) {
				vinfo.value[index].DecrRefCount();
			}
			vinfo.value[index] = tclobj.AsObj(value);
			vinfo.value[index].IncrRefCount();
		}
		return value;
	};

	this._parse_varname = function(varname) {
		var array, index, idx;

		// TODO: properly
		idx = varname.lastIndexOf('(');
		array = varname.substr(0, idx);
		index = varname.substr(idx+1, varname.length-idx-2);

		return [array, index];
	};

	this.get_var = function(varname, make_unshared) {
		var parts, obj;
		varname = tclobj.AsVal(varname);
		if (varname[varname.length-1] === ')') {
			parts = this._parse_varname(varname);
			return this.get_array(parts[0], parts[1], make_unshared);
		}
		obj = this.get_scalar(varname, make_unshared);
		return obj;
	};

	this.set_var = function(varname, value) {
		var parts;
		varname = tclobj.AsVal(varname);
		if (varname[varname.length-1] === ')') {
			parts = this._parse_varname(varname);
			return this.set_array(parts[0], parts[1], value);
		}
		return this.set_scalar(varname, value);
	};

	this.resolve_command = function(commandname, failifmissing) {
		var cinfo = this.commands[commandname];
		failifmissing = failifmissing === undefined ? true : failifmissing;
		if (cinfo === undefined && failifmissing) {
			throw new TclError('invalid command name "'+commandname+'"');
		}
		return cinfo;
	};

	this.registerCommand = function(commandname, handler, thisobj, priv, onDelete) {
		var cinfo = this.resolve_command(commandname, false);
		if (cinfo !== undefined && cinfo.onDelete) {
			cinfo.onDelete(cinfo.priv);
		} else {
			cinfo = this.commands[commandname] = {
			};
		}
		cinfo.handler = handler;
		cinfo.priv = priv;
		cinfo.thisobj = thisobj !== undefined ? thisobj : null;
		cinfo.onDelete = onDelete;
	};

	this.checkArgs = function(args, count, msg) {
		var min, max;
		if (count instanceof Array) {
			min = count[0];
			max = count[1] || 9007199254740992;	// javascript maxint
		} else {
			min = count;
			max = count;
		}
		if (args.length-1 < min || args.length-1 > max) {
			throw new TclError('wrong # args: should be "'+args[0]+' '+msg+'"',
				'TCL', 'WRONGARGS');
		}
	};

	this.resolve_word = function(tokens, c_ok, c_err) {
		var parts=[], expand=false, array, self=this, t_i=0;

		return function next_token(){
			var i, word, res, index, token = tokens[t_i++];

			if (token === undefined) {
				if (parts.length === 0) {
					return c_ok([]);
				}
				if (parts.length > 1) {
					word = '';
					for (i=0; i<parts.length; i++) {
						word += parts[i].GetString();
					}
					res = tclobj.NewString(word);
				} else {
					res = parts[0];
				}
				return c_ok(expand ? tclobj.GetList(res) : [res]);
			}

			switch (token[0]) {
				case parser.EXPAND:
					expand = true;
					break;

				case parser.TXT:
					parts.push(tclobj.NewString(token[1]));
					break;

				case parser.VAR:
					parts.push(self.get_scalar(token[1]));
					break;

				case parser.ARRAY:
					array = token[1];
					break;

				case parser.INDEX:
					return self.resolve_word(token[1], function(indexwords){
						index = indexwords.join('');
						parts.push(self.get_array(array, index));
						array = null;
						return next_token;
					}, function(err){
						return c_err(err);
					});

				case parser.SCRIPT:
					if (!(token[1] instanceof ScriptObj)) {
						token[1] = new ScriptObj(token);
					}
					return self.exec(token[1], function(result){
						parts.push(result.result);
						return next_token;
					}, function(err){
						return c_err(err);
					});
			}

			return next_token;
		};
	};

	this.get_words = function(commandline, c_ok, c_err) {
		var self = this, sofar = [], r_i = 0;

		return function next_word(){
			var resolved, next = commandline[r_i++];

			if (next === undefined) {
				if (sofar.length === 0) {return c_ok(sofar);}
				try {
					resolved = self.resolve_command(sofar[0]);
				} catch(e){
					return c_err(e);
				}
				sofar[0] = {
					text: sofar[0],
					cinfo: resolved
				};
				return c_ok(sofar);
			}

			return self.resolve_word(next, function(addwords){
				var i;
				for (i=0; i<addwords.length; i++) {
					sofar.push(addwords[i]);
				}
				return next_word;
			}, function(err){
				return c_err(err);
			});
		};
	};

	this.eval_command = function(commandline, c) {
		var self=this;

		function normalize_result(result) {
			if (!(result instanceof TclResult)) {
				if (result instanceof TclError) {
					result = new TclResult(ERROR, result, {errorcode: result.errorcode});
				} else if (result instanceof Error) {
					result = new TclResult(ERROR, tclobj.NewString(result));
				} else {
					result = new TclResult(OK, result);
				}
			}
			result.result = tclobj.AsObj(result.result);
			return result;
		}

		function got_result(result) {
			return c(normalize_result(result));
		}

		return this.get_words(commandline, function(words){
			var i, result, args, command;
			if (words.length === 0) {
				return c(null);
			}
			command = words[0];
			args = [command.text];
			for (i=1; i<words.length; i++) {
				args.push(words[i]);
			}
			try {
				result = command.cinfo.handler(args, self, command.priv);
			} catch(e) {
				result = e;
			}
			if (result instanceof Promise) {
				result.then(function(result){
					self._trampoline(got_result(result));
				}, function(err){
					self._trampoline(got_result(new TclResult(ERROR, tclobj.NewString(err))));
				});
			} else {
				return got_result(result);
			}
		}, function(err){
			return c(err);
		});
	};

	this.exec = function(script, c_ok, c_err) {
		var lastresult=new TclResult(OK), self=this,
			parse = tclobj.AsObj(script).GetExecParse(),
			commands = parse[1], i = 0;

		return function next_command(){
			var command = commands[i++];
			if (command === undefined) {
				if (lastresult.code === OK || lastresult.code === RETURN) {
					return c_ok(lastresult);
				}
				return c_err(lastresult);
			}

			return self.eval_command(command, function(result){
				if (result !== null) {
					if (result.code === ERROR) {
						return c_err(result);
					}
					lastresult = result;
				}
				return next_command;
			});
		};
	};

	this._trampoline = function(res) {
		while (typeof res === "function") {
			res = res();
		}
		return res;
	};

	this.TclEval = function(script) {
		var promise = new Promise();
		this._trampoline(this.exec(script, function(res){
			promise.resolve(res);
		}, function(err){
			promise.reject(err);
		}));
		return promise;
	};

	function resolve_operand(operand, cb) {
		var i = 2,	// 0 is funcname, 1 is (
			parts, funcname, args;

		function next_part(){
			var part = parts[i++], func_handler;
			if (part === undefined) {
				if (mathfuncs[funcname] === undefined) {
					// Not really true yet
					throw new TclError('invalid command name "tcl::mathfunc::'+funcname+'"');
				}
				func_handler = mathfuncs[funcname];
				if (typeof func_handler === 'string') {
					return cb(Math[func_handler].apply(Math, args));
				}
				if (func_handler.args) {
					if (args.length < func_handler.args[0]) {
						throw new TclError('too few arguments to math function "'+funcname+'"', 'TCL', 'WRONGARGS');
					}
					if (func_handler.args[1] !== null && args.length > func_handler.args[1]) {
						throw new TclError('too many arguments to math function "'+funcname+'"', 'TCL', 'WRONGARGS');
					}
				}
				return cb(func_handler.handler(args, self, func_handler.priv));
			}
			if (part[0] === ARG) {
				if (part[1] === EXPR) {
					return self._TclExpr(tclobj.NewExpr(part[2]),
						function(res) {
							args.push(res);
							return next_part;
						}, function(res) {
							throw new Error('Error resolving expression: '+res);
						}
					);
				} else {
					args.push(part[2]);
					return next_part;
				}
			} else {
				return next_part;
			}
		}

		if (!(operand instanceof Array)) {
			return cb(operand);
		}
		//console.log('resolving operand: ', operand.slice());
		switch (operand[1]) {
			case MATHFUNC:
				parts = operand[2];
				funcname = parts[0][3];
				args = [];
				return next_part;
			case INTEGER:
			case FLOAT:
			case BOOL:
			case BRACED:
				return cb(operand[2]);
			case QUOTED:
				throw new Error('Resolving a quoted string in an expression not suppoted yet');
			case VAR:
				if (operand[2].length === 1) {
					return cb(self.get_scalar(operand[2][0]));
				}
				if (typeof operand[2][1] === 'string') {
					return cb(self.get_array(operand[2][0], operand[2][1]));
				}
				return self.resolve_word(operand[2][1], function(indexwords){
					var index;
					index = indexwords.join('');
					return cb(self.get_array(operand[2][0], index));
				}, function(err){
					throw new Error('Error resolving array index: '+err);
				});
			case SCRIPT:
				if (operand[2] instanceof Array) {
					operand[2] = new ScriptObj(operand[2]);
				}
				return self.exec(operand[2], function(res){
					return cb(res.result);
				}, function(err){
					throw new Error('Error resolving script operand: '+err);
				});
			default:
				throw new Error('Unexpected operand type: '+operand[1]);
		}
	}

	function resolve_operands(operands, body, cb) {
		var resolved_operands = [], i=0;

		// Optimize the case when all the operands are already resolved
		for (i=0; i<operands.length; i++) {
			if (operands[i] instanceof Array) {
				break;
			}
			resolved_operands.push(operands[i]);
		}
		if (i === operands.length) {
			return cb(body.apply(null, resolved_operands));
		}

		return function next_operand() {
			var operand = operands[i++];
			if (operand === undefined) {
				//console.log('operands: ', operands, ' resolve to: ', resolved_operands);
				return cb(body.apply(null, resolved_operands));
			}
			return resolve_operand(operand, function(resolved){
				resolved_operands.push(resolved);
				return next_operand;
			});
		};
	}

	function not_implemented(){throw new Error('Not implemented yet');}
	function bignum_not_implemented(){throw new Error('Bignum support not implemented yet');}
	mathfuncs = {
		abs: 'abs',
		acos: 'acos',
		asin: 'asin',
		atan: 'atan',
		atan2: 'atan2',
		bool: {args: [1, 1],
			handler: function(args) {return [OPERAND, BOOL, list.bool(args[0])];}
		},
		ceil: 'ceil',
		cos: 'cos',
		cosh: {args: [1, 1], handler: not_implemented},
		'double': {args: [1, 1],
			handler: function(args) {return [OPERAND, FLOAT, args[0]];}
		},
		entier: {args: [1, 1], handler: bignum_not_implemented},
		exp: 'exp',
		floor: 'floor',
		fmod: {args: [2, 2],
			handler: function(args){ var a = args[0], b = args[1];
				return a - (Math.floor(a / b) * b);
			}
		},
		hypot: {args: [2, 2],
			handler: function(args){ var a = args[0], b = args[1];
				// I don't think this exactly does what the Tcl hypot does
				return Math.sqrt(a*a + b*b);
			}
		},
		'int': {args: [1, 1],
			handler: function(args) {
				return [OPERATOR, INTEGER, Math.floor(args[0])];
			}
		},
		isqrt: {args: [1, 1], handler: bignum_not_implemented},
		log: 'log',
		log10: {args: [1, 1], handler: not_implemented},
		max: 'max',
		min: 'min',
		pow: 'pow',
		rand: 'random',	// Doesn't precisely match the bounds of the Tcl rand
		round: {args: [1, 1],
			handler: function(args) {
				return [OPERATOR, INTEGER, Math.round(args[0])];
			}
		},
		sin: 'sin',
		sinh: {args: [1, 1], handler: not_implemented},
		sqrt: 'sqrt',
		srand: {args: [1, 1],	// TODO: implement an RNG that can be seeded?
			handler: function() {}
		},
		tan: 'tan',
		tanh: {args: [1, 1], handler: not_implemented},
		wide: {args: [1, 1],
			handler: function(args){
				if (console) {
					console.warn('Javascript doesn\'t support 64bit integers');
				}
				return [OPERATOR, INTEGER, Math.floor(args[0])];
			}
		}
	};
	/*jslint eqeq: true */
	mathops = {
		1: {
			'!': function(args, cb) {return resolve_operands(args, function(a){return ! list.bool(a);}, cb);},
			'~': function(args, cb) {return resolve_operands(args, function(a){return ~ a;}, cb);},
			'-': function(args, cb) {return resolve_operands(args, function(a){return - a;}, cb);},
			'+': function(args, cb) {return cb(args[0]);}
		},
		2: {
			'*': function(args, cb) {return resolve_operands(args, function(a, b){
				return a * b;
			}, cb);},
			'/': function(args, cb) {return resolve_operands(args, function(a, b){
				return a / b;
			}, cb);},
			'%': function(args, cb) {return resolve_operands(args, function(a, b){
				return a % b;
			}, cb);},
			'+': function(args, cb) {return resolve_operands(args, function(a, b){
				return a + b;
			}, cb);},
			'-': function(args, cb) {return resolve_operands(args, function(a, b){
				return a - b;
			}, cb);},
			'<<': function(args, cb) {return resolve_operands(args, function(a, b){
				return a << b;
			}, cb);},
			'>>': function(args, cb) {return resolve_operands(args, function(a, b){
				return a >> b;
			}, cb);},
			'**': function(args, cb) {return resolve_operands(args, function(a, b){
				return Math.pow(a, b);
			}, cb);},
			'||': function(args, cb) {return resolve_operands([args[0]], function(a){
				return list.bool(a) || args[1];
			}, cb);},
			'&&': function(args, cb) {return resolve_operands([args[0]], function(a){
				return list.bool(a) && args[1];
			}, cb);},
			'<': function(args, cb) {return resolve_operands(args, function(a, b){
				return a < b;
			}, cb);},
			'>': function(args, cb) {return resolve_operands(args, function(a, b){
				return a > b;
			}, cb);},
			'<=': function(args, cb) {return resolve_operands(args, function(a, b){
				return a <= b;
			}, cb);},
			'>=': function(args, cb) {return resolve_operands(args, function(a, b){
				return a >= b;
			}, cb);},
			'==': function(args, cb) {return resolve_operands(args, function(a, b){
				return a == b;
			}, cb);},
			'!=': function(args, cb) {return resolve_operands(args, function(a, b){
				return a != b;
			}, cb);},
			'eq': function(args, cb) {return resolve_operands(args, function(a, b){
				return String(a) === String(b);
			}, cb);},
			'ne': function(args, cb) {return resolve_operands(args, function(a, b){
				return String(a) !== String(b);
			}, cb);},
			'&': function(args, cb) {return resolve_operands(args, function(a, b){
				return a & b;
			}, cb);},
			'^': function(args, cb) {return resolve_operands(args, function(a, b){
				return a ^ b;
			}, cb);},
			'|': function(args, cb) {return resolve_operands(args, function(a, b){
				return a | b;
			}, cb);},
			'in': function(args, cb) {return resolve_operands(args, function(a, b){
				return tclobj.AsObj(b).GetList().indexOf(a) !== -1;
			}, cb);},
			'ni': function(args, cb) {return resolve_operands(args, function(a, b){
				return tclobj.AsObj(b).GetList().indexOf(a) === -1;
			}, cb);}
		},
		3: {
			'?': function(args, cb) {
				return resolve_operands([args[0]], function(a){
					return list.bool(a) ? args[1] : args[2];
				}, cb);
			}
		},
		any: {}
	};
	/*jslint eqeq: false */

	function eval_operator(op, args, cb) {
		var name = op[3], takes = args.length;
		if (mathops[takes][name] === undefined) {
			throw new TclError('Invalid operator "'+name+'"');
		}
		return mathops[takes][name](args, cb);
	}

	this.TclExpr = function(expr) {
		var promise = new Promise();
		this._trampoline(this._TclExpr(expr, function(res){
			promise.resolve(res);
		}, function(err){
			promise.reject(err);
		}));
		return promise;
	};

	this._TclExpr = function(expr, c_ok, c_err) {
		var P = tclobj.AsObj(expr).GetExprStack(), i=0, args, j, res,
			stack = [];
		// Algorithm from Harry Hutchins http://faculty.cs.niu.edu/~hutchins/csci241/eval.htm
		return function next_P(){
			var thisP = P[i++];
			if (thisP === undefined) {
				res = stack.pop();
				if (stack.length) {
					throw new Error('Expr stack not empty at end of eval:'+stack);
				}
				if (!(res instanceof Array)) {
					return c_ok(res);
				}
				return resolve_operand(res, function(res){
					return c_ok(res);
				});
			}

			switch (thisP[0]) {
				case OPERAND:
					stack.push(thisP);
					break;
				case OPERATOR:
					args = [];
					j = thisP[2];
					while (j--) {
						args.push(stack.pop());
					}
					return eval_operator(thisP, args.reverse(), function(res){
						//console.log('eval_operator '+thisP[3]+' (', args, ') = ', res);
						stack.push(res);
						return next_P;
					});
			}
			return next_P;
		};
	};

	this.TclError = TclError;
	this.TclResult = TclResult;
	this.tclobj = tclobj;

	this.register_extension = function(ex) {
		if (this.extensions[ex] === undefined) {
			this.extensions[ex] = true;
			return false;
		}
		return true;
	};

	// Load the extensions
	for (i=0; i<args.length; i++) {
		args[i].install(this);
	}
};
});
