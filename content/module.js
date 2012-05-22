/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/console/commandLine",
    "firebug/console/commandLineExposed",
    "firebug/dom/domPanel",
    "fireclosure/autoCompleter",
],
function(Obj, FBTrace, Firebug, Domplate, CommandLine, CommandLineExposed, DOMPanel, AutoCompleter) {
"use strict";

// ********************************************************************************************* //
// Custom Module Implementation

Firebug.FireClosureModule = Obj.extend(Firebug.Module,
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    addScopeToMembers: function(members, object, level, scope, name)
    {
        var type = "proto";
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

            // Add the object's scope as a pseudo-object at the bottom.
            // The overridden getObjectView transforms it into something
            // readable by the rest of Firebug.
            var win = context && context.window;
            win = win && win.wrappedJSObject;
            if (win) {
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
            if (ScopeRep.supportsObject(object))
                return getScopeWrapper(object);
            return oldGetObjectView(object);
        };

        // Firebug stupidly does inheritance through copying of properties, so we
        // have to add the functions to all subclasses of DOMBasePanel we know of.
        var classes = [
            Firebug.DOMBasePanel,
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

        // Override the event-passing evaluator (used in the command line) by
        // one that handles .%.
        var origEv = CommandLine.evaluateByEventPassing;
        CommandLine.evaluateByEventPassing = function(expr) {
            var args = [].slice.call(arguments);
            args[0] = AutoCompleter.transformScopeExpr(expr, '_scopedVars');
            if (FBTrace.DBG_FIRECLOSURE && args[0] !== expr) {
                FBTrace.sysout("FireClosure; transforming expression: `" +
                        expr + "` -> `" +
                        args[0] + "`");
            }
            return origEv.apply(CommandLine, args);
        };

        // Override the debug evaluator by one that handles .%. This differs
        // from the above in that this one cannot inject the command line
        // because with statements might be invalid in strict mode.
        var origDebug = CommandLine.evaluateInDebugFrame;
        CommandLine.evaluateInDebugFrame = function(expr, context, thisExpr, targetWin) {
            var args = [].slice.call(arguments);
            var fname = '__fb_scopedVars';

            args[0] = AutoCompleter.transformScopeExpr(expr, fname);
            var inj = false, win;
            if (args[0] !== expr) {
                if (FBTrace.DBG_FIRECLOSURE) {
                    FBTrace.sysout("FireClosure; transforming expression in debug mode: `" +
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
                return origDebug.apply(CommandLine, args);
            }
            finally {
                if (inj) {
                    try { delete win[fname]; }
                    catch (e) {}
                }
            }
        };

        // Add the _scopedVars helper to the command line.
        var cr = CommandLineExposed.createFirebugCommandLine;
        CommandLineExposed.createFirebugCommandLine = function(context, win) {
            var cmd = cr.apply(CommandLineExposed, arguments);
            var w = win.wrappedJSObject;
            cmd._scopedVars = function(obj) {
                return Firebug.FireClosure.getScopedVarsWrapper(w, obj);
            };
            cmd.__exposedProps__['_scopedVars'] = 'r';
            return cmd;
        };

        this.extendDOMPanel();
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        if (FBTrace.DBG_FIRECLOSURE)
            FBTrace.sysout("FireClosure; Module.shutdown");
    },

    showPanel: function(browser, panel)
    {
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
        if (!FC.dbgc)
            return false;
        return object instanceof FC.dbgc.Environment;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.FireClosureModule);

return Firebug.FireClosureModule;

// ********************************************************************************************* //
});
