/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/options",
    "firebug/console/commandLine",
    "firebug/dom/domPanel",
    "fireclosure/autoCompleter",
],
function(Obj, FBTrace, Firebug, Domplate, Options, CommandLine, DOMPanel, AutoCompleter) {
"use strict";

// ********************************************************************************************* //
// Custom Module Implementation

Firebug.FireClosureModule = Obj.extend(Firebug.Module,
{
    domPrefName: "fireclosure.showInDomPanel",
    hintsPrefName: "fireclosure.showHints",
    domActive: false,

    addScopeToMembers: function(members, object, level, scope, name)
    {
        var m = {
            object: object,
            name: name,
            value: scope,
            type: "proto",
            rowClass: "memberRow-proto",
            open: "",
            order: 0,
            level: level,
            indent: level*16,
            hasChildren: true,
            tag: ScopeRep.tag,
            prefix: "",
            readOnly: true
        };
        members.push(m);
    },

    extendDOMPanel: function()
    {
        var oldGetMembers = Firebug.DOMBasePanel.prototype.getMembers;
        var oldGetObjectView = Firebug.DOMBasePanel.prototype.getObjectView;
        var self = this;

        function getScopeWrapper(scope) {
            var FC = Firebug.FireClosure;
            var win = scope.win, dwin = FC.getDebuggerGlobal(win);
            return Proxy.create({
                desc: function(name)
                {
                    return {
                        get: function() {
                            return FC.unwrap(win, dwin, scope.getVariable(name));
                        },
                        set: function(value) {
                            value = dwin.makeDebuggeeValue(value);
                            scope.setVariable(name, value);
                        }
                    };
                },
                getOwnPropertyDescriptor: function(name) { return this.desc(name); },
                getPropertyDescriptor: function(name) { return this.desc(name); },
                keys: function()
                {
                    return scope.names();
                },
                enumerate: function() { return this.keys(); },
                getOwnPropertyNames: function() { return this.keys(); },
                getPropertyNames: function() { return this.keys(); }
            }, null);
        }

        var newGetMembers = function(object, level, context)
        {
            var members = oldGetMembers.apply(this, arguments);

            // Some domplate objects don't provide contexts - grab one arbitrarily.
            context = context || Firebug.currentContext;

            // Add the object's scope as a pseudo-object at the bottom.
            // The overridden getObjectView transforms it into something
            // readable by the rest of Firebug.
            var win = context && context.window;
            win = win && win.wrappedJSObject;
            if (self.domActive && win) {
                var isScope = ScopeRep.supportsObject(object);
                var scope, scopeName;
                if (isScope) {
                    scope = object.parent;
                    scopeName = "(parent scope)";
                }
                else {
                    scope = Firebug.FireClosure.getScope(win, object);
                    scopeName = "(scoped variables)";
                }
                while (scope && !scope.names().length)
                    scope = scope.parent;
                if (Firebug.FireClosure.scopeIsInteresting(scope)) {
                    scope.win = win;
                    self.addScopeToMembers(members, object, level, scope, scopeName);
                }
            }

            return members;
        };

        var newGetObjectView = function(object)
        {
            if (self.domActive && ScopeRep.supportsObject(object))
                return getScopeWrapper(object);
            return oldGetObjectView(object);
        };

        // Firebug stupidly does inheritance through copying of properties, so we
        // have to add the functions to all subclasses of DOMBasePanel we know of.
        var classes = [
            Firebug.DOMBasePanel,
            Firebug.WatchPanel,
            Firebug.DOMPanel,
            Firebug.getPanelType('domSide')
        ];
        for (var i = 0; i < classes.length; ++i) {
            var cl = classes[i];
            cl.prototype.getMembers = newGetMembers;
            cl.prototype.getObjectView = newGetObjectView;
        }

        Firebug.registerRep(ScopeRep);
    },

    initialize: function(owner)
    {
        Firebug.Module.initialize.apply(this, arguments);

        if (FBTrace.DBG_FIRECLOSURE)
            FBTrace.sysout("FireClosure; Module.initialize");

        // Override the evaluator by one that handles .%. This is done by
        // sticking a function for getting scope on the global object, where it
        // is easily accessible even in cases when there is no command line
        // object (e.g., issue 5321). If the expression doesn't use .%, don't
        // inject the function, to avoid leaking capabilities into arbitrary
        // web pages.
        var origEv = CommandLine.evaluate;
        CommandLine.evaluate = function(expr, context, thisValue, targetWin) {
            var args = [].slice.call(arguments);
            var fname = "__fb_scopedVars";

            args[0] = AutoCompleter.transformScopeExpr(expr, fname);
            var inj = false, win;
            if (args[0] !== expr) {
                if (FBTrace.DBG_FIRECLOSURE) {
                    FBTrace.sysout("FireClosure; transforming expression: `" +
                            expr + "` -> `" +
                            args[0] + "`");
                }
                inj = true;
            }

            if (inj) {
                try {
                    win = targetWin || context.baseWindow || context.window;
                    win = win.wrappedJSObject;
                    win[fname] = function(obj) {
                        return Firebug.FireClosure.getScopedVarsWrapper(win, obj);
                    };
                }
                catch (e) {
                    if (FBTrace.DBG_FIRECLOSURE)
                        FBTrace.sysout("FireClosure; failed to inject " + fname, e);
                }
            }

            try {
                return origEv.apply(CommandLine, args);
            }
            finally {
                if (inj) {
                    try { delete win[fname]; }
                    catch (e) {}
                }
            }
        };

        this.extendDOMPanel();
        Firebug.registerUIListener(this);
    },

    shutdown: function()
    {
        Firebug.unregisterUIListener(this);
        Firebug.Module.shutdown.apply(this, arguments);

        if (FBTrace.DBG_FIRECLOSURE)
            FBTrace.sysout("FireClosure; Module.shutdown");
    },

    showPanel: function(browser, panel)
    {
    },

    updateOption: function(name, value)
    {
        if (name === this.domPrefName)
            this.domActive = value;
    },

    onOptionsMenu: function(context, panel, items)
    {
        if (panel.name === "dom") {
            var pref = this.domPrefName;
            var option = {
                label: "Show Closure Variables",
                nol10n: true,
                type: "checkbox",
                checked: Options.get(pref),
                option: pref,
                tooltiptext: "Show the closures associated with various objects (FireClosure)",
                command: function() {
                    Options.togglePref(pref);
                    panel.rebuild(true);
                }
            };

            // Append the option at the right position.
            for (var i = 0; i < items.length; ++i) {
                var item = items[i];
                if (item.option === "showInlineEventHandlers") {
                    items.splice(i+1, 0, option);
                    break;
                }
            }
        }
        else if (panel.name === "console") {
            var pref = this.hintsPrefName;
            var option = {
                label: "Show Closure Hints",
                nol10n: true,
                type: "checkbox",
                checked: Options.get(pref),
                option: pref,
                tooltiptext: "Hint at existence of closures in the completion popup (FireClosure)",
                command: function() {
                    Options.togglePref(pref);
                }
            };

            // Append the option at the right position.
            for (var i = 0; i < items.length; ++i) {
                var item = items[i];
                if (item.option === "commandLineShowCompleterPopup") {
                    items.splice(i, 0, option);
                    break;
                }
            }
        }
    }
});


var ScopeRep = Domplate.domplate(Firebug.Rep,
{
    tag:
        Domplate.SPAN(
            { _repObject: "$object" },
            "$object|getTitle"
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "scope",

    getTitle: function(object)
    {
        return "[" + object.type + " scope]";
    },

    supportsObject: function(object, type)
    {
        var FC = Firebug.FireClosure;
        if (!FC.Debugger)
            return false;
        return object instanceof FC.Debugger.Environment;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.FireClosureModule);

return Firebug.FireClosureModule;

// ********************************************************************************************* //
});
