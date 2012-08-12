/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/console/autoCompleter",
],
function(Obj, Firebug, FirebugReps, Locale, Events, Wrapper, Dom, Str, Arr) {

// ********************************************************************************************* //
// Constants

const reOpenBracket = /[\[\(\{]/;
const reCloseBracket = /[\]\)\}]/;
const reJSChar = /[a-zA-Z0-9$_]/;
const reLiteralExpr = /^[ "0-9,]*$/;

// ********************************************************************************************* //
// JavaScript auto-completion

var OldJSAutoCompleter = Firebug.JSAutoCompleter;

Firebug.JSAutoCompleter = function(textBox, completionBox, options)
{
    var popupSize = 40;

    OldJSAutoCompleter.apply(this, arguments);

    this.shouldIncludeHint = function()
    {
        return (this.completions &&
                this.completionBase.hasScope &&
                !this.completions.prefix &&
                !/\[['"]|\.%/.test(this.completionBase.expr.slice(-2)));
    }

    /* Modified to use the right parsing/evaluation functions, and pass scope
     * data to them. */
    this.createCandidates = function(context)
    {
        var offset = this.textBox.selectionStart;
        if (offset !== this.textBox.value.length)
        {
            this.hide();
            return;
        }

        var value = this.textBox.value;

        // Create a simplified expression by redacting contents/normalizing
        // delimiters of strings and regexes, to make parsing easier.
        // Give up if the syntax is too weird.
        var svalue = simplifyExpr(value);
        if (svalue === null)
        {
            this.hide();
            return;
        }

        if (killCompletions(svalue, value))
        {
            this.hide();
            return;
        }

        // Find the expression to be completed.
        var parseStart = getExpressionOffset(svalue);
        var parsed = value.substr(parseStart);
        var sparsed = svalue.substr(parseStart);

        // Find which part of it represents the property access.
        var propertyStart = getPropertyOffset(sparsed);
        var prop = parsed.substring(propertyStart);
        var spreExpr = sparsed.substr(0, propertyStart);
        var preExpr = parsed.substr(0, propertyStart);

        this.completionBase.pre = value.substr(0, parseStart);

        if (FBTrace.DBG_COMMANDLINE)
        {
            var sep = (parsed.indexOf("|") > -1) ? "^" : "|";
            FBTrace.sysout("Completing: " + this.completionBase.pre + sep + preExpr + sep + prop);
        }

        var prevCompletions = this.completions;

        // We only need to calculate a new candidate list if the expression has
        // changed (we can ignore this.completionBase.pre since completions do not
        // depend upon that).
        if (preExpr !== this.completionBase.expr)
        {
            this.completionBase.expr = preExpr;
            this.completionBase.candidates = [];
            this.completionBase.hasScope = false;
            autoCompleteEval(this.completionBase, context, preExpr, spreExpr,
                this.options.includeCurrentScope);
            prevCompletions = null;
        }

        this.createCompletions(prop, prevCompletions);
    };

    /* Modified to ignore the .% hint in the popup. */
    this.pageCycle = function(dir)
    {
        var list = this.completions.list, selIndex = this.completions.index;

        if (!this.isPopupOpen())
        {
            // When no popup is open, cycle by a fixed amount and stop at edges.
            this.cycle(dir * 15, true);
            return;
        }

        var top = this.popupTop, bottom = this.popupBottom;

        // Ignore the .% hint.
        if (bottom > list.length)
            --bottom;

        if (top === 0 && bottom === list.length)
        {
            // For a single scroll page, act like home/end.
            this.topCycle(dir);
            return;
        }

        var immediateTarget;
        if (dir === -1)
            immediateTarget = (top === 0 ? top : top + 2);
        else
            immediateTarget = (bottom === list.length ? bottom : bottom - 2) - 1;
        if ((selIndex - immediateTarget) * dir < 0)
        {
            // The selection has not yet reached the edge target, so jump to it.
            selIndex = immediateTarget;
        }
        else
        {
            // Show the next page.
            if (dir === -1 && top - popupSize <= 0)
                selIndex = 0;
            else if (dir === 1 && bottom + popupSize >= list.length)
                selIndex = list.length - 1;
            else
                selIndex = immediateTarget + dir*popupSize;
        }

        this.completions.index = selIndex;
        this.showCompletions(true);
    };

    /* Hacked to include the .% hint in the count */
    var oldShowCompletions = this.showCompletions;
    this.showCompletions = function()
    {
        if (this.completions && this.shouldIncludeHint())
        {
            // Add a sentinel (removed further down, and in popupCandidates) to
            // make the count right in the real showCompletions, without having
            // to duplicate logic.
            this.completions.list.push(undefined);
            this.completions.hasHintElement = true;
        }

        oldShowCompletions.apply(this, arguments);

        if (this.completions && this.completions.hasHintElement)
        {
            this.completions.list.pop();
            delete this.completions.hasHintElement;
        }
    };

    /* Edited to include the .% hint. */
    this.popupCandidates = function(cycling)
    {
        if (this.completions.hasHintElement)
        {
            this.completions.list.pop();
            delete this.completions.hasHintElement;
        }

        Dom.eraseNode(this.completionPopup);
        this.selectedPopupElement = null;

        var vbox = this.completionPopup.ownerDocument.createElement("vbox");
        this.completionPopup.appendChild(vbox);
        vbox.classList.add("fbCommandLineCompletions");

        var title = this.completionPopup.ownerDocument.
            createElementNS("http://www.w3.org/1999/xhtml","div");
        title.innerHTML = Locale.$STR("console.Use Arrow keys, Tab or Enter");
        title.classList.add("fbPopupTitle");
        vbox.appendChild(title);

        var list = this.completions.list, selIndex = this.completions.index;
        var listSize = list.length;
        if (this.shouldIncludeHint())
            ++listSize;

        if (listSize <= popupSize)
        {
            this.popupTop = 0;
            this.popupBottom = listSize;
        }
        else
        {
            var self = this;
            var setTop = function(val)
            {
                if (val < 0)
                    val = 0;
                self.popupTop = val;
                self.popupBottom = val + popupSize;
                if (self.popupBottom > listSize)
                    setBottom(listSize);
            };
            var setBottom = function(val)
            {
                if (val > listSize)
                    val = listSize;
                self.popupBottom = val;
                self.popupTop = val - popupSize;
                if (self.popupTop < 0)
                    setTop(0);
            };

            if (!cycling)
            {
                // Show the selection at nearly the bottom of the popup, where
                // it is more local.
                setBottom(selIndex + 3);
            }
            else
            {
                // Scroll the popup such that selIndex fits.
                if (selIndex - 2 < this.popupTop)
                    setTop(selIndex - 2);
                else if (selIndex + 3 > this.popupBottom)
                    setBottom(selIndex + 3);
            }
        }

        var prefixLen = this.completions.prefix.length;

        for (var i = this.popupTop; i < this.popupBottom; i++)
        {
            var hbox = this.completionPopup.ownerDocument.
                createElementNS("http://www.w3.org/1999/xhtml","div");

            if (i === list.length) {
                var text = this.completionPopup.ownerDocument.
                    createElementNS("http://www.w3.org/1999/xhtml","span");
                text.innerHTML = "% for scope members...";
                text.style.fontStyle = "italic";
                text.style.paddingLeft = "3px";
                text.style.fontSize = "90%";
                text.style.color = "#777";
                hbox.appendChild(text);
            }
            else {
                var completion = list[i];
                hbox.completionIndex = i;

                var pre = this.completionPopup.ownerDocument.
                    createElementNS("http://www.w3.org/1999/xhtml","span");
                var preText = this.textBox.value;
                if (prefixLen)
                    preText = preText.slice(0, -prefixLen) + completion.slice(0, prefixLen);
                pre.textContent = preText;
                pre.classList.add("userTypedText");

                var post = this.completionPopup.ownerDocument.
                    createElementNS("http://www.w3.org/1999/xhtml","span");
                var postText = completion.substr(prefixLen);
                post.textContent = postText;
                post.classList.add("completionText");

                if (i === selIndex)
                    this.selectedPopupElement = hbox;

                hbox.appendChild(pre);
                hbox.appendChild(post);
            }
            vbox.appendChild(hbox);
        }

        if (this.selectedPopupElement)
            this.selectedPopupElement.setAttribute("selected", "true");

        this.completionPopup.openPopup(this.textBox, "before_start", 0, 0, false, false);
    };
};

/**
 * Transform an expression from using .% into something JavaScript-friendly, which
 * delegates to a helper function.
 * Used only in module.js, but autoCompleter.js has so many nice helper functions.
 */
Firebug.JSAutoCompleter.transformScopeExpr = function(expr, fname)
{
    var sexpr = simplifyExpr(expr);
    if (!sexpr) return expr;
    var search = 0;
    for (;;) {
        var end = sexpr.indexOf(".%", search);
        if (end === -1) break;
        var start = getExpressionOffset(sexpr, end);
        expr = expr.substr(0, start) + "(" + fname + "(" +
            expr.substring(start, end) + "))." +
            expr.substr(end+2);
        sexpr = sexpr.substr(0, start) + "(" + fname + "(" +
            sexpr.substring(start, end) + "))." +
            sexpr.substr(end+2);
        search = end + fname + "(()).".length;
    }
    return expr;
};

// ********************************************************************************************* //
// Auto-completion helpers

/**
 * Try to find the position at which the expression to be completed starts.
 */
function getExpressionOffset(command, start)
{
    if (typeof start === 'undefined')
        start = command.length;

    var bracketCount = 0, instr = false;

    // When completing []-accessed properties, start instead from the last [.
    var lastBr = command.lastIndexOf("[", start);
    if (lastBr !== -1 && /^" *$/.test(command.substring(lastBr+1, start)))
        start = lastBr;

    for (var i = start-1; i >= 0; --i)
    {
        var c = command[i];
        if (reOpenBracket.test(c))
        {
            if (bracketCount)
                --bracketCount;
            else
                break;
        }
        else if (reCloseBracket.test(c))
        {
            var next = command[i + 1];
            if (bracketCount === 0 && next !== "." && next !== "[")
                break;
            else
                ++bracketCount;
        }
        else if (bracketCount === 0)
        {
            if (c === '"') instr = !instr;
            else if (instr || reJSChar.test(c) || c === "." ||
                (c === "%" && command[i-1] === "."))
                ;
            else
                break;
        }
    }
    ++i;

    // The 'new' operator has higher precedence than function calls, so, if
    // present, it should be included if the expression contains a parenthesis.
    var ind = command.indexOf("(", i+1);
    if (i-4 >= 0 && ind !== -1 && ind < start && command.substr(i-4, 4) === "new ")
    {
        i -= 4;
    }

    return i;
}

/**
 * Try to find the position at which the property name of the final property
 * access in an expression starts (for example, 2 in 'a.b').
 */
function getPropertyOffset(expr)
{
    var lastBr = expr.lastIndexOf("[");
    if (lastBr !== -1 && /^" *$/.test(expr.substr(lastBr+1)))
        return lastBr+2;

    var lastDot = expr.lastIndexOf(".");
    if (lastDot !== -1 && expr.charAt(lastDot+1) === "%")
        return lastDot+2;

    return lastDot+1;
}

/**
 * Get the index of the last non-whitespace character in the range [0, from)
 * in str, or -1 if there is none.
 */
function prevNonWs(str, from)
{
    for (var i = from-1; i >= 0; --i)
    {
        if (str.charAt(i) !== " ")
            return i;
    }
    return -1;
}

/**
 * Find the start of a word consisting of characters matching reJSChar, if
 * str[from] is the last character in the word. (This can be used together
 * with prevNonWs to traverse words backwards from a position.)
 */
function prevWord(str, from)
{
    for (var i = from-1; i >= 0; --i)
    {
        if (!reJSChar.test(str.charAt(i)))
            return i+1;
    }
    return 0;
}

function isFunctionName(expr, pos)
{
    pos -= 9;
    return (pos >= 0 && expr.substr(pos, 9) === "function " &&
            (pos === 0 || !reJSChar.test(expr.charAt(pos-1))));
}

function bwFindMatchingParen(expr, from)
{
    var bcount = 1;
    for (var i = from-1; i >= 0; --i)
    {
        if (reCloseBracket.test(expr.charAt(i)))
            ++bcount;
        else if (reOpenBracket.test(expr.charAt(i)))
            if (--bcount === 0)
                return i;
    }
    return -1;
}

/**
 * Check if a '/' at the end of 'expr' would be a regex or a division.
 * May also return null if the expression seems invalid.
 */
function endingDivIsRegex(expr)
{
    var kwActions = ["throw", "return", "in", "instanceof", "delete", "new",
        "do", "else", "typeof", "void", "yield"];
    var kwCont = ["function", "if", "while", "for", "switch", "catch", "with"];

    var ind = prevNonWs(expr, expr.length), ch = (ind === -1 ? "{" : expr.charAt(ind));
    if (reJSChar.test(ch))
    {
        // Test if the previous word is a keyword usable like 'kw <expr>'.
        // If so, we have a regex, otherwise, we have a division (a variable
        // or literal being divided by something).
        var w = expr.substring(prevWord(expr, ind), ind+1);
        return (kwActions.indexOf(w) !== -1);
    }
    else if (ch === ")")
    {
        // We have a regex in the cases 'if (...) /blah/' and 'function name(...) /blah/'.
        ind = bwFindMatchingParen(expr, ind);
        if (ind === -1)
            return null;
        ind = prevNonWs(expr, ind);
        if (ind === -1)
            return false;
        if (!reJSChar.test(expr.charAt(ind)))
            return false;
        var wind = prevWord(expr, ind);
        if (kwCont.indexOf(expr.substring(wind, ind+1)) !== -1)
            return true;
        return isFunctionName(expr, wind);
    }
    else if (ch === "]")
    {
        return false;
    }
    return true;
}

// Check if a "{" in an expression is an object declaration.
function isObjectDecl(expr, pos)
{
    var ind = prevNonWs(expr, pos);
    if (ind === -1)
        return false;
    var ch = expr.charAt(ind);
    return !(ch === ")" || ch === "{" || ch === "}" || ch === ";");
}

function isCommaProp(expr, start)
{
    var beg = expr.lastIndexOf(",")+1;
    if (beg < start)
        beg = start;
    while (expr.charAt(beg) === " ")
        ++beg;
    var prop = expr.substr(beg);
    return isValidProperty(prop);
}

function simplifyExpr(expr)
{
    var ret = "", len = expr.length, instr = false, strend, inreg = false, inclass, brackets = [];

    for (var i = 0; i < len; ++i)
    {
        var ch = expr.charAt(i);
        if (instr)
        {
            if (ch === strend)
            {
                ret += '"';
                instr = false;
            }
            else
            {
                if (ch === "\\" && i+1 !== len)
                {
                    ret += " ";
                    ++i;
                }
                ret += " ";
            }
        }
        else if (inreg)
        {
            if (inclass && ch === "]")
                inclass = false;
            else if (!inclass && ch === "[")
                inclass = true;
            else if (!inclass && ch === "/")
            {
                // End of regex, eat regex flags
                inreg = false;
                while (i+1 !== len && reJSChar.test(expr.charAt(i+1)))
                {
                    ret += " ";
                    ++i;
                }
                ret += '"';
            }
            if (inreg)
            {
                if (ch === "\\" && i+1 !== len)
                {
                    ret += " ";
                    ++i;
                }
                ret += " ";
            }
        }
        else
        {
            if (ch === "'" || ch === '"')
            {
                instr = true;
                strend = ch;
                ret += '"';
            }
            else if (ch === "/")
            {
                var re = endingDivIsRegex(ret);
                if (re === null)
                    return null;
                if (re)
                {
                    inreg = true;
                    ret += '"';
                }
                else
                    ret += "/";
            }
            else
            {
                if (reOpenBracket.test(ch))
                    brackets.push(ch);
                else if (reCloseBracket.test(ch))
                {
                    // Check for mismatched brackets
                    if (!brackets.length)
                        return null;
                    var br = brackets.pop();
                    if (br === "(" && ch !== ")")
                        return null;
                    if (br === "[" && ch !== "]")
                        return null;
                    if (br === "{" && ch !== "}")
                        return null;
                }
                ret += ch;
            }
        }
    }

    return ret;
}

// Check if auto-completion should be killed.
function killCompletions(expr, origExpr)
{
    // Make sure there is actually something to complete at the end.
    if (expr.length === 0)
        return true;

    if (reJSChar.test(expr[expr.length-1]) ||
            expr.slice(-1) === "." ||
            expr.slice(-2) === ".%")
    {
        // An expression at the end - we're fine.
    }
    else
    {
        var lastBr = expr.lastIndexOf("[");
        if (lastBr !== -1 && /^" *$/.test(expr.substr(lastBr+1)) &&
            origExpr.charAt(lastBr+1) !== "/")
        {
            // Array completions - we're fine.
        }
        else {
            return true;
        }
    }

    // Check for 'function i'.
    var ind = expr.lastIndexOf(" ");
    if (isValidProperty(expr.substr(ind+1)) && isFunctionName(expr, ind+1))
        return true;

    // Check for '{prop: ..., i'.
    var bwp = bwFindMatchingParen(expr, expr.length);
    if (bwp !== -1 && expr.charAt(bwp) === "{" &&
            isObjectDecl(expr, bwp) && isCommaProp(expr, bwp+1))
    {
        return true;
    }

    // Check for 'var prop..., i'.
    var vind = expr.lastIndexOf("var ");
    if (bwp < vind && isCommaProp(expr, vind+4))
    {
        // Note: This doesn't strictly work, because it kills completions even
        // when we have started a new expression and used the comma operator
        // in it (ie. 'var a; a, i'). This happens very seldom though, so it's
        // not really a problem.
        return true;
    }

    // Check for 'function f(i'.
    while (bwp !== -1 && expr.charAt(bwp) !== "(")
    {
        bwp = bwFindMatchingParen(expr, bwp);
    }
    if (bwp !== -1)
    {
        var ind = prevNonWs(expr, bwp);
        if (ind !== -1)
        {
            var stw = prevWord(expr, ind);
            if (expr.substring(stw, ind+1) === "function")
                return true;
            ind = prevNonWs(expr, stw);
            if (ind !== -1 && expr.substring(prevWord(expr, ind), ind+1) === "function")
                return true;
        }
    }
    return false;
}

// Types the autocompletion knows about, some of their non-enumerable properties,
// and the return types of some member functions, included in the Firebug.CommandLine
// object to make it more easily extensible.

var AutoCompletionKnownTypes = {
    "void": {
        "_fb_ignorePrototype": true
    },
    "Array": {
        "pop": "|void",
        "push": "|void",
        "shift": "|void",
        "unshift": "|void",
        "reverse": "|Array",
        "sort": "|Array",
        "splice": "|Array",
        "concat": "|Array",
        "slice": "|Array",
        "join": "|String",
        "indexOf": "|Number",
        "lastIndexOf": "|Number",
        "filter": "|Array",
        "map": "|Array",
        "reduce": "|void",
        "reduceRight": "|void",
        "every": "|void",
        "forEach": "|void",
        "some": "|void",
        "length": "Number"
    },
    "String": {
        "_fb_contType": "String",
        "split": "|Array",
        "substr": "|String",
        "substring": "|String",
        "charAt": "|String",
        "charCodeAt": "|String",
        "concat": "|String",
        "indexOf": "|Number",
        "lastIndexOf": "|Number",
        "localeCompare": "|Number",
        "match": "|Array",
        "search": "|Number",
        "slice": "|String",
        "replace": "|String",
        "toLowerCase": "|String",
        "toLocaleLowerCase": "|String",
        "toUpperCase": "|String",
        "toLocaleUpperCase": "|String",
        "trim": "|String",
        "length": "Number"
    },
    "RegExp": {
        "test": "|void",
        "exec": "|Array",
        "lastIndex": "Number",
        "ignoreCase": "void",
        "global": "void",
        "multiline": "void",
        "source": "String"
    },
    "Date": {
        "getTime": "|Number",
        "getYear": "|Number",
        "getFullYear": "|Number",
        "getMonth": "|Number",
        "getDate": "|Number",
        "getDay": "|Number",
        "getHours": "|Number",
        "getMinutes": "|Number",
        "getSeconds": "|Number",
        "getMilliseconds": "|Number",
        "getUTCFullYear": "|Number",
        "getUTCMonth": "|Number",
        "getUTCDate": "|Number",
        "getUTCDay": "|Number",
        "getUTCHours": "|Number",
        "getUTCMinutes": "|Number",
        "getUTCSeconds": "|Number",
        "getUTCMilliseconds": "|Number",
        "setTime": "|void",
        "setYear": "|void",
        "setFullYear": "|void",
        "setMonth": "|void",
        "setDate": "|void",
        "setHours": "|void",
        "setMinutes": "|void",
        "setSeconds": "|void",
        "setMilliseconds": "|void",
        "setUTCFullYear": "|void",
        "setUTCMonth": "|void",
        "setUTCDate": "|void",
        "setUTCHours": "|void",
        "setUTCMinutes": "|void",
        "setUTCSeconds": "|void",
        "setUTCMilliseconds": "|void",
        "toUTCString": "|String",
        "toLocaleDateString": "|String",
        "toLocaleTimeString": "|String",
        "toLocaleFormat": "|String",
        "toDateString": "|String",
        "toTimeString": "|String",
        "toISOString": "|String",
        "toGMTString": "|String",
        "toJSON": "|String",
        "toString": "|String",
        "toLocaleString": "|String",
        "getTimezoneOffset": "|Number"
    },
    "Function": {
        "call": "|void",
        "apply": "|void",
        "length": "Number",
        "prototype": "void"
    },
    "HTMLElement": {
        "getElementsByClassName": "|NodeList",
        "getElementsByTagName": "|NodeList",
        "getElementsByTagNameNS": "|NodeList",
        "querySelector": "|HTMLElement",
        "querySelectorAll": "|NodeList",
        "firstChild": "HTMLElement",
        "lastChild": "HTMLElement",
        "firstElementChild": "HTMLElement",
        "lastElementChild": "HTMLElement",
        "parentNode": "HTMLElement",
        "previousSibling": "HTMLElement",
        "nextSibling": "HTMLElement",
        "previousElementSibling": "HTMLElement",
        "nextElementSibling": "HTMLElement",
        "children": "NodeList",
        "childNodes": "NodeList"
    },
    "NodeList": {
        "_fb_contType": "HTMLElement",
        "length": "Number",
        "item": "|HTMLElement",
        "namedItem": "|HTMLElement"
    },
    "Window": {
        "encodeURI": "|String",
        "encodeURIComponent": "|String",
        "decodeURI": "|String",
        "decodeURIComponent": "|String",
        "eval": "|void",
        "parseInt": "|Number",
        "parseFloat": "|Number",
        "isNaN": "|void",
        "isFinite": "|void",
        "NaN": "Number",
        "Math": "Math",
        "undefined": "void",
        "Infinity": "Number"
    },
    "HTMLDocument": {
        "querySelector": "|HTMLElement",
        "querySelectorAll": "|NodeList"
    },
    "Math": {
        "E": "Number",
        "LN2": "Number",
        "LN10": "Number",
        "LOG2E": "Number",
        "LOG10E": "Number",
        "PI": "Number",
        "SQRT1_2": "Number",
        "SQRT2": "Number",
        "abs": "|Number",
        "acos": "|Number",
        "asin": "|Number",
        "atan": "|Number",
        "atan2": "|Number",
        "ceil": "|Number",
        "cos": "|Number",
        "exp": "|Number",
        "floor": "|Number",
        "log": "|Number",
        "max": "|Number",
        "min": "|Number",
        "pow": "|Number",
        "random": "|Number",
        "round": "|Number",
        "sin": "|Number",
        "sqrt": "|Number",
        "tan": "|Number"
    },
    "Number": {
        // There are also toFixed and valueOf, but they are left out because
        // they steal focus from toString by being shorter (in the case of
        // toFixed), and because they are used very seldom.
        "toExponential": "|String",
        "toPrecision": "|String",
        "toLocaleString": "|String",
        "toString": "|String"
    }
};

var LinkType = {
    "PROPERTY": 0,
    "SCOPED_VARS": 1,
    "INDEX": 2,
    "CALL": 3,
    "SAFECALL": 4,
    "RETVAL_HEURISTIC": 5
};

function getKnownType(t)
{
    var known = AutoCompletionKnownTypes;
    if (known.hasOwnProperty(t))
        return known[t];
    return null;
}

function getKnownTypeInfo(r)
{
    if (r.charAt(0) === "|")
        return {"val": "Function", "ret": r.substr(1)};
    return {"val": r};
}

function getFakeCompleteKeys(name)
{
    var ret = [], type = getKnownType(name);
    if (!type)
        return ret;
    for (var prop in type) {
        if (prop.substr(0, 4) !== "_fb_")
            ret.push(prop);
    }
    return ret;
}

function eatProp(expr, start)
{
    for (var i = start; i < expr.length; ++i)
        if (!reJSChar.test(expr.charAt(i)))
            break;
    return i;
}

function matchingBracket(expr, start)
{
    var count = 1;
    for (var i = start + 1; i < expr.length; ++i) {
        var ch = expr.charAt(i);
        if (reOpenBracket.test(ch))
            ++count;
        else if (reCloseBracket.test(ch))
            if (!--count)
                return i;
    }
    return -1;
}

function getTypeExtractionExpression(command)
{
    // Return a JavaScript expression for determining the type / [[Class]] of
    // an object given by another JavaScript expression. For DOM nodes, return
    // HTMLElement instead of HTML[node type]Element, for simplicity.
    var ret = "(function() { var v = " + command + "; ";
    ret += "if (window.HTMLElement && v instanceof HTMLElement) return 'HTMLElement'; ";
    ret += "return Object.prototype.toString.call(v).slice(8, -1);})()";
    return ret;
}

function sortUnique(ar)
{
    ar = ar.slice();
    ar.sort();
    var ret = [];
    for (var i = 0; i < ar.length; ++i)
    {
        if (i && ar[i-1] === ar[i])
            continue;
        ret.push(ar[i]);
    }
    return ret;
}

function hasScopedVariables(context, obj)
{
    try {
        if (typeof obj !== "object" && typeof obj !== "function")
            return false;
        var w = context.window.wrappedJSObject;
        var parts = Firebug.FireClosure.getScopedVariables(w, obj);
        return parts.some(function(part) { return part.length > 0; });
    }
    catch (e) {
        if (FBTrace.DBG_FIRECLOSURE)
            FBTrace.sysout("FireClosure; failed to check for closed over variables", e);
        return false;
    }
}

function propChainBuildComplete(out, context, tempExpr, result)
{
    var complete = null, command = null;

    if (out.scopeCompletion)
    {
        if (tempExpr.fake)
            return;
        if (typeof result !== "object" && typeof result !== "function")
            return;
        var w = context.window.wrappedJSObject;
        var parts = Firebug.FireClosure.getScopedVariables(w, result);
        complete = Array.prototype.concat.apply([], parts);
        out.complete = sortUnique(complete);
        return;
    }

    if (tempExpr.fake)
    {
        var name = tempExpr.value.val;
        complete = getFakeCompleteKeys(name);
        if (!getKnownType(name)._fb_ignorePrototype)
            command = name + ".prototype";
    }
    else
    {
        if (typeof result === "string")
        {
            // Strings only have indices as properties, use the fake object
            // completions instead.
            tempExpr.fake = true;
            tempExpr.value = getKnownTypeInfo("String");
            propChainBuildComplete(out, context, tempExpr);
            return;
        }
        else if (FirebugReps.Arr.isArray(result, context.window))
            complete = nonNumericKeys(result);
        else
            complete = Arr.keys(result);
        command = getTypeExtractionExpression(tempExpr.command);
        out.hasScope = hasScopedVariables(context, result);
    }

    var done = function()
    {
        if (out.indexCompletion)
        {
            complete = complete.map(function(x)
            {
                x = (out.indexQuoteType === '"') ? Str.escapeJS(x): Str.escapeSingleQuoteJS(x);
                return x + out.indexQuoteType + "]";
            });
        }

        // Properties may be taken from several sources, so filter out duplicates.
        out.complete = sortUnique(complete);
    };

    if (command === null)
    {
        done();
    }
    else
    {
        Firebug.CommandLine.evaluate(command, context, context.thisValue, null,
            function found(result, context)
            {
                if (tempExpr.fake)
                {
                    complete = complete.concat(Arr.keys(result));
                }
                else
                {
                    if (typeof result === "string" && getKnownType(result))
                    {
                        complete = complete.concat(getFakeCompleteKeys(result));
                    }
                }
                done();
            },
            function failed(result, context)
            {
                done();
            }
        );
    }
}

function evalPropChainStep(step, tempExpr, evalChain, out, context)
{
    if (tempExpr.fake)
    {
        if (step === evalChain.length)
        {
            propChainBuildComplete(out, context, tempExpr);
            return;
        }

        var link = evalChain[step], type = link.type;
        if (type === LinkType.PROPERTY || type === LinkType.INDEX)
        {
            // Use the accessed property if it exists, otherwise abort. It
            // would be possible to continue with a 'real' expression of
            // `tempExpr.value.val`.prototype, but since prototypes seldom
            // contain actual values of things this doesn't work very well.
            var mem = (type === LinkType.INDEX ? "_fb_contType" : link.name);
            var t = getKnownType(tempExpr.value.val);
            if (t.hasOwnProperty(mem))
                tempExpr.value = getKnownTypeInfo(t[mem]);
            else
                return;
        }
        else if (type === LinkType.CALL)
        {
            if (tempExpr.value.ret)
                tempExpr.value = getKnownTypeInfo(tempExpr.value.ret);
            else
                return;
        }
        else
        {
            return;
        }
        evalPropChainStep(step+1, tempExpr, evalChain, out, context);
    }
    else
    {
        var funcCommand = null, link, type;
        while (step !== evalChain.length)
        {
            link = evalChain[step];
            type = link.type;
            if (type === LinkType.PROPERTY)
            {
                tempExpr.thisCommand = tempExpr.command;
                tempExpr.command += "." + link.name;
            }
            else if (type === LinkType.SCOPED_VARS)
            {
                tempExpr.thisCommand = "window";
                tempExpr.command += ".%" + link.name;
            }
            else if (type === LinkType.INDEX)
            {
                tempExpr.thisCommand = "window";
                tempExpr.command += "[" + link.cont + "]";
            }
            else if (type === LinkType.SAFECALL)
            {
                tempExpr.thisCommand = "window";
                tempExpr.command += "(" + link.origCont + ")";
            }
            else if (type === LinkType.CALL)
            {
                if (link.name === "")
                {
                    // We cannot know about functions without name; try the
                    // heuristic directly.
                    link.type = LinkType.RETVAL_HEURISTIC;
                    evalPropChainStep(step, tempExpr, evalChain, out, context);
                    return;
                }

                funcCommand = getTypeExtractionExpression(tempExpr.thisCommand);
                break;
            }
            else if (type === LinkType.RETVAL_HEURISTIC)
            {
                if (link.origCont !== null &&
                     (link.name.substr(0, 3) === "get" ||
                      (link.name.charAt(0) === "$" && link.cont.indexOf(",") === -1)))
                {
                    // Names beginning with get or $ are almost always getters, so
                    // assume it is a safecall and start over.
                    link.type = LinkType.SAFECALL;
                    evalPropChainStep(step, tempExpr, evalChain, out, context);
                    return;
                }
                funcCommand = "Function.prototype.toString.call(" + tempExpr.command + ")";
                break;
            }
            ++step;
        }

        var func = (funcCommand !== null), command = (func ? funcCommand : tempExpr.command);
        Firebug.CommandLine.evaluate(command, context, context.thisValue, null,
            function found(result, context)
            {
                if (func)
                {
                    if (type === LinkType.CALL)
                    {
                        if (typeof result !== "string")
                            return;

                        var t = getKnownType(result);
                        if (t && t.hasOwnProperty(link.name))
                        {
                            var propVal = getKnownTypeInfo(t[link.name]);

                            // Make sure the property is a callable function
                            if (!propVal.ret)
                                return;

                            tempExpr.fake = true;
                            tempExpr.value = getKnownTypeInfo(propVal.ret);
                            evalPropChainStep(step+1, tempExpr, evalChain, out, context);
                        }
                        else
                        {
                            // Unknown 'this' type or function name, use
                            // heuristics on the function instead.
                            link.type = LinkType.RETVAL_HEURISTIC;
                            evalPropChainStep(step, tempExpr, evalChain, out, context);
                        }
                    }
                    else if (type === LinkType.RETVAL_HEURISTIC)
                    {
                        if (typeof result !== "string")
                            return;

                        // Perform some crude heuristics for figuring out the
                        // return value of a function based on its contents.
                        // It's certainly not perfect, and it's easily fooled
                        // into giving wrong results,  but it might work in
                        // some common cases.

                        // Check for chaining functions. This is done before
                        // checking for nested functions, because completing
                        // results of member functions containing nested
                        // functions that use 'return this' seems uncommon,
                        // and being wrong is not a huge problem.
                        if (result.indexOf("return this;") !== -1)
                        {
                            tempExpr.command = tempExpr.thisCommand;
                            tempExpr.thisCommand = "window";
                            evalPropChainStep(step+1, tempExpr, evalChain, out, context);
                            return;
                        }

                        // Don't support nested functions.
                        if (result.lastIndexOf("function") !== 0)
                            return;

                        // Check for arrays.
                        if (result.indexOf("return [") !== -1)
                        {
                            tempExpr.fake = true;
                            tempExpr.value = getKnownTypeInfo("Array");
                            evalPropChainStep(step+1, tempExpr, evalChain, out, context);
                            return;
                        }

                        // Check for 'return new Type(...);', and use the
                        // prototype as a pseudo-object for those (since it
                        // is probably not a known type that we can fake).
                        var newPos = result.indexOf("return new ");
                        if (newPos !== -1)
                        {
                            var rest = result.substr(newPos + 11),
                                epos = rest.search(/[^a-zA-Z0-9_$.]/);
                            if (epos !== -1)
                            {
                                rest = rest.substring(0, epos);
                                tempExpr.command = rest + ".prototype";
                                evalPropChainStep(step+1, tempExpr, evalChain, out, context);
                                return;
                            }
                        }
                    }
                }
                else
                {
                    propChainBuildComplete(out, context, tempExpr, result);
                }
            },
            function failed(result, context) { }
        );
    }
}

function evalPropChain(out, preExpr, origExpr, context)
{
    var evalChain = [], linkStart = 0, len = preExpr.length, lastProp = "";
    var tempExpr = {"fake": false, "command": "window", "thisCommand": "window"};
    while (linkStart !== len)
    {
        var ch = preExpr.charAt(linkStart);
        if (linkStart === 0)
        {
            if (preExpr.substr(0, 4) === "new ")
            {
                var parInd = preExpr.indexOf("(");
                tempExpr.command = preExpr.substring(4, parInd) + ".prototype";
                linkStart = matchingBracket(preExpr, parInd) + 1;
            }
            else if (ch === "[")
            {
                tempExpr.fake = true;
                tempExpr.value = getKnownTypeInfo("Array");
                linkStart = matchingBracket(preExpr, linkStart) + 1;
            }
            else if (ch === '"')
            {
                var isRegex = (origExpr.charAt(0) === "/");
                tempExpr.fake = true;
                tempExpr.value = getKnownTypeInfo(isRegex ? "RegExp" : "String");
                linkStart = preExpr.indexOf('"', 1) + 1;
            }
            else if (!isNaN(ch))
            {
                // The expression is really a decimal number.
                return false;
            }
            else if (reJSChar.test(ch))
            {
                // The expression begins with a regular property name
                var nextLink = eatProp(preExpr, linkStart);
                lastProp = preExpr.substring(linkStart, nextLink);
                linkStart = nextLink;
                tempExpr.command = lastProp;
            }

            // Syntax error (like '.') or a too complicated expression.
            if (linkStart === 0)
                return false;
        }
        else
        {
            if (ch === ".")
            {
                // Property access
                var scope = (preExpr.charAt(linkStart+1) === "%");
                linkStart += (scope ? 2 : 1);
                var nextLink = eatProp(preExpr, linkStart);
                lastProp = preExpr.substring(linkStart, nextLink);
                linkStart = nextLink;
                evalChain.push({
                    "type": (scope ? LinkType.SCOPED_VARS : LinkType.PROPERTY),
                    "name": lastProp
                });
            }
            else if (ch === "(")
            {
                // Function call. Save the function name and the arguments if
                // they are safe to evaluate.
                var endCont = matchingBracket(preExpr, linkStart);
                var cont = preExpr.substring(linkStart+1, endCont), origCont = null;
                if (reLiteralExpr.test(cont))
                    origCont = origExpr.substring(linkStart+1, endCont);
                linkStart = endCont + 1;
                evalChain.push({
                    "type": LinkType.CALL,
                    "name": lastProp,
                    "origCont": origCont,
                    "cont": cont
                });

                lastProp = "";
            }
            else if (ch === "[")
            {
                // Index. Use the supplied index if it is a literal; otherwise
                // it is probably a loop index with a variable not yet defined
                // (like 'for(var i = 0; i < ar.length; ++i) ar[i].prop'), and
                // '0' seems like a reasonably good guess at a valid index.
                var endInd = matchingBracket(preExpr, linkStart);
                var ind = preExpr.substring(linkStart+1, endInd);
                if (reLiteralExpr.test(ind))
                    ind = origExpr.substring(linkStart+1, endInd);
                else
                    ind = "0";
                linkStart = endInd+1;
                evalChain.push({"type": LinkType.INDEX, "cont": ind});
                lastProp = "";
            }
            else
            {
                // Syntax error
                return false;
            }
        }
    }

    evalPropChainStep(0, tempExpr, evalChain, out, context);
    return true;
}

function autoCompleteEval(base, context, preExpr, spreExpr, includeCurrentScope)
{
    var out = {};

    out.complete = [];
    out.hasScope = false;

    try
    {
        if (spreExpr)
        {
            // Complete member variables of some .-chained expression

            // In case of array indexing, remove the bracket and set a flag to
            // escape completions.
            out.indexCompletion = false;
            out.scopeCompletion = false;
            var len = spreExpr.length;
            if (len >= 2 && spreExpr[len-2] === "[" && spreExpr[len-1] === '"')
            {
                out.indexCompletion = true;
                out.indexQuoteType = preExpr[len-1];
                len -= 2;
            }
            else if (spreExpr.slice(-2) === ".%")
            {
                out.scopeCompletion = true;
                len -= 2;
            }
            else
            {
                len -= 1;
            }
            spreExpr = spreExpr.substr(0, len);
            preExpr = preExpr.substr(0, len);

            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("commandLine.autoCompleteEval pre:'" + preExpr +
                    "' spre:'" + spreExpr + "'.");

            // Don't auto-complete '.'.
            if (spreExpr === "")
                return;

            evalPropChain(out, spreExpr, preExpr, context);
        }
        else
        {
            // Complete variables from the local scope

            var contentView = Wrapper.getContentView(context.window);
            if (context.stopped && includeCurrentScope)
            {
                out.complete = Firebug.Debugger.getCurrentFrameKeys(context);
            }
            else if (contentView && contentView.Window &&
                contentView.constructor.toString() === contentView.Window.toString())
                // Cross window type pseudo-comparison
            {
                out.complete = Arr.keys(contentView); // return is safe

                // Add some known window properties
                out.complete = out.complete.concat(getFakeCompleteKeys("Window"));
            }
            else  // hopefully sandbox in Chromebug
            {
                out.complete = Arr.keys(context.global);
            }

            // Sort the completions, and avoid duplicates.
            out.complete = sortUnique(out.complete);
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS && FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.autoCompleteEval FAILED", exc);
    }

    base.candidates = out.complete;
    base.hasScope = out.hasScope;
}

var reValidJSToken = /^[A-Za-z_$][A-Za-z_$0-9]*$/;
function isValidProperty(value)
{
    // Use only string props
    if (typeof(value) != "string")
        return false;

    // Use only those props that don't contain unsafe charactes and so need
    // quotation (e.g. object["my prop"] notice the space character).
    // Following expression checks that the name starts with a letter or $_,
    // and there are only letters, numbers or $_ character in the string (no spaces).

    return reValidJSToken.test(value);
}

const rePositiveNumber = /^[1-9][0-9]*$/;
function nonNumericKeys(map)  // keys will be on user-level window objects
{
    var keys = [];
    try
    {
        for (var name in map)  // enumeration is safe
        {
            if (! (name === "0" || rePositiveNumber.test(name)) )
                keys.push(name);
        }
    }
    catch (exc)
    {
        // Sometimes we get exceptions trying to iterate properties
    }

    return keys;  // return is safe
}

// ********************************************************************************************* //
// Registration

return Firebug.JSAutoCompleter;

// ********************************************************************************************* //
});
