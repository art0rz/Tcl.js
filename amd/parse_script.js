/*jslint plusplus: true, white: true */
/*global define */

define(function(){
"use strict";

/* For debugging
 */
var TOK		= 'TOK',
	SPACE	= 'SPACE',
	VAR		= 'VAR',
	ARRAY	= 'ARRAY',
	INDEX	= 'INDEX',
	EOL		= 'EOL',
	END		= 'END',
	SCRIPT	= 'SCRIPT',
	COMMENT	= 'COMMENT',
	EXPAND	= 'EXPAND',
	SYNTAX	= 'SYNTAX';
	/*
var TOK		= 0,
	SPACE	= 1,
	VAR		= 2,
	ARRAY	= 3,
	INDEX	= 4,
	EOL		= 5,
	END		= 6,
	SCRIPT	= 7,
	COMMENT	= 8,
	EXPAND	= 9,
	SYNTAX	= 10;
 */

function ParseError(message) {
	this.name = 'ParseError';
	this.message = message;
}
ParseError.prototype = new Error();

function parse_script(text) {
	var i, word, lasttoken, command = [], commands = [], matches;

	function get_word(first, incmdsubst) {
		var token, tokens, re;

		function emit_waiting(type) {
			if (token) {
				tokens.push([type, token]);
				token = '';
			}
		}

		function emit(tok) {
			tokens.push(tok);
			token = '';
		}

		function parse_escape() {
			var escapechars;

			i++;
			switch (text[i]) {
				case undefined:
					token += '\\';
					break;

				case 'a': token += String.fromCharCode(0x7); i++; break;
				case 'b': token += String.fromCharCode(0x8); i++; break;
				case 'f': token += String.fromCharCode(0xc); i++; break;
				case 'n': token += String.fromCharCode(0xa); i++; break;
				case 'r': token += String.fromCharCode(0xd); i++; break;
				case 't': token += String.fromCharCode(0x9); i++; break;
				case 'v': token += String.fromCharCode(0xb); i++; break;

				case 'x':
					i++;
					matches = text.substr(i).match(/^[0-9A-Fa-f]+/);
					if (matches !== null) {
						escapechars = matches[0];
						token += String.fromCharCode(parseInt(escapechars, 16) % 0xff);
						i += escapechars.length;
					} else {
						token += 'x';
					}
					break;

				case 'u':
					i++;
					matches = text.substr(i).match(/^[0-9A-Fa-f]{1,4}/);
					if (matches !== null) {
						escapechars = matches[0];
						token += String.fromCharCode(parseInt(escapechars, 16));
						i += escapechars.length;
					} else {
						token += 'u';
					}
					break;

				default:
					matches = text.substr(i).match(/^[0-7]{1,3}/);
					if (matches !== null) {
						escapechars = matches[0];
						token += String.fromCharCode(parseInt(escapechars, 8));
						i += escapechars.length;
					} else {
						token += text[i++];
					}
					break;
			}
		}

		function parse_commands() {
			var word, lasttoken, command = [], commands = [];
			emit([SYNTAX, text[i++]]);
			while (true) {
				word = get_word(command.length === 0, true);
				command.push(word);
				lasttoken = word[word.length-1];
				if (lasttoken[0] === EOL) {
					commands.push(command);
					command = [];
				}
				if (lasttoken[0] === END) {
					commands.push(command);
					command = [];
					break;
				}
			}
			emit([SCRIPT, commands]);
		}

		function parse_variable() {
			var idx, save_i;

			if (text[i+1] === '$') {
				token += text[i++];
				return;
			}
			emit_waiting(TOK);
			emit([SYNTAX, text[i++]]);

			function parse_index() {
				// escape, variable and command substs apply here
				emit([SYNTAX, text[i++]]);
				while (true) {
					switch (text[i]) {
						case ')':
							emit([INDEX, token]);
							emit([SYNTAX, text[i++]]);
							return;

						case '\\': parse_escape(); break;
						case '$': parse_variable(); break;
						case '[': parse_commands(); break;

						default: token += text[i++]; break;
					}
				}
			}

			if (text[i] === '{') {
				emit([SYNTAX, text[i++]]);
				idx = text.indexOf('}', i);
				if (idx === -1) {
					throw new ParseError('missing close-brace for variable name');
				}
				token = text.substr(i, idx);
				i += idx;
				if (token[token.length-1] === ')' && (idx = token.lastIndexOf('(')) !== -1) {
					token = token.substr(0, idx);
					emit([ARRAY, token]);
					save_i = i;
					i = idx;
					parse_index();
					i = save_i;
				} else {
					emit([VAR, token]);
				}
				emit([SYNTAX, text[i++]]);
			} else {
				token = text.substr(i).match(/[a-zA-Z_0-9:]+/)[0];
				// : alone is a name terminator
				idx = token.replace(/::/, '__').indexOf(':');
				if (idx > 0) {
					token.substr(0, idx);
				}
				i += token.length;
				if (text[i] !== '(') {
					emit([VAR, token]);
				} else {
					emit([ARRAY, token]);
					parse_index();
				}
			}
		}

		function parse_braced() {
			var idx, depth = 1, from;
			emit([SYNTAX, text[i++]]);
			from = i;
			while (depth) {
				idx = text.substr(i).search(/[{}]/);
				if (idx === -1) {throw new ParseError('missing close-brace');}
				i += idx;
				if (text[i-1] !== '\\') {
					if (text[i] === '{') {
						depth++;
					} else {
						depth--;
					}
				}
				i++;
			}
			i--;
			emit([TOK, text.substr(from, i-from)]);
			emit([SYNTAX, text[i++]]);
			return tokens;
		}

		function parse_combined(quoted) {
			var matched;

			if (quoted) {
				emit([SYNTAX, text[i++]]);
			}

			while (true) {
				matched = true;

				if (quoted) {
					switch (text[i]) {
						case undefined:
							throw new ParseError('missing "');

						case '"':
							if (text[i+1] !== undefined && !/[\s;]/.test(text[i+1])) {
								throw new ParseError('extra characters after close-quote');
							}
							emit_waiting(TOK);
							emit([SYNTAX, text[i++]]);
							return tokens;

						default: matched = false;
					}
				} else {
					switch (text[i]) {
						case undefined:
							emit_waiting(TOK);
							emit([END, '']);
							return tokens;

						case '\n':
						case ';':
							emit_waiting(TOK);
							token = text[i++];
							emit([EOL, token]);
							return tokens;

						case ' ':
						case '\t':
							emit_waiting(TOK);
							return tokens;

						default: matched = false;
					}
				}

				if (!matched) {
					switch (text[i]) {
						case '\\':
							parse_escape();
							break;

						case '$':
							parse_variable();
							break;

						case '[':
							parse_commands();
							break;

						case ']':
							if (incmdsubst) {
								emit_waiting(TOK);
								token = text[i++];
								emit([END, token]);
								return tokens;
							}
							// Falls through
						default:
							token += text[i++];
							break;
					}
				}
			}
		}

		tokens = [];
		token = '';
		re = first ? /[\t #]/ : /[t ]/;

		// Consume any leading whitespace / comments if first word
		while (re.test(text[i])) {
			while (/[\t ]/.test(text[i])) {
				token += text[i++];
			}
			emit_waiting(SPACE);
			if (first && text[i] === '#') {
				while (text[i] !== undefined && text[i] !== '\n') {
					token += text[i++];
				}
				emit([COMMENT, token]);
			}
		}

		// handle {*}
		if (text[i] === '{' && text.substr(i, 3) === '{*}') {
			emit([EXPAND, '{*}']);
			i += 3;
		}

		switch (text[i]) {
			case undefined:	emit([END, '']); return tokens;
			case '{':		return parse_braced();
			case '"':		return parse_combined(true);
			case ']':
				if (incmdsubst) {
					emit([EOL, ']']);
					return tokens;
				}
				// Falls through to default
			default:		return parse_combined(false);
		}
	}

	i = 0;
	// First unfold - happens even in brace quoted words
	text = text.replace(/\\\n\s*/g, ' ');

	var patience = 100;
	while (true) {
		if (patience-- < 0) {
			debugger;
		}
		word = get_word(command.length === 0, false);
		command.push(word);
		lasttoken = word[word.length-1];
		if (lasttoken[0] === EOL) {
			commands.push(command);
			command = [];
		} else if (lasttoken[0] === END) {
			commands.push(command);
			command = [];
			break;
		}
	}
	return [SCRIPT, commands];
}

return parse_script;

});
