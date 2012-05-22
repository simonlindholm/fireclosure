/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/firebug",
    "fireclosure/module",
],
function(FBTrace, Firebug, Module) {
"use strict";

var FireClosure =
{
    hasInit: false,
    Debugger: null,
    dbg: null,

    getDebuggerGlobal: function(global)
    {
        if (!this.hasInit) {
            this.hasInit = true;
            try {
                Components.utils.import("resource://gre/modules/jsdebugger.jsm");
                if (window.addDebuggerToGlobal)
                    window.addDebuggerToGlobal(window);
                this.Debugger = Debugger;

                if (!this.Debugger.Environment.prototype.getVariable)
                    throw new Error("Environment.getVariable unavailable (update your browser).");

                this.dbg = new this.Debugger();
                this.dbg.enabled = false;
                if (FBTrace.DBG_FIRECLOSURE)
                    FBTrace.sysout("FireClosure; got debugger", this.dbg);
            }
            catch (e) {
                if (FBTrace.DBG_FIRECLOSURE)
                    FBTrace.sysout("FireClosure; debugger initialization failed", e);
            }
        }

        if (!this.dbg)
            return null;
        var dglobal = this.dbg.addDebuggee(global);
        return dglobal;
    },

    unwrap: function(global, dglobal, obj)
    {
        dglobal.defineProperty('_fireclosureUnwrap', { value: obj, writable: true });
        return global._fireclosureUnwrap;
    },

    getScopeF: function(obj)
    {
        return obj.environment;
    },

    getScopedVariableF: function(obj, mem)
    {
        try {
            var env = obj.environment.find(mem);
            if (env)
                return env.getVariable(mem);
            if (FBTrace.DBG_FIRECLOSURE)
                FBTrace.sysout("FireClosure; getScopedVariableF didn't find anything");
        }
        catch (e) {
            if (FBTrace.DBG_FIRECLOSURE)
                FBTrace.sysout("FireClosure; getScopedVariableF failed", e);
        }

        // Nothing found, for whatever reason.
        return undefined;
    },

    setScopedVariableF: function(obj, mem, to)
    {
        try {
            var env = obj.environment.find(mem);
            if (env) {
                env.setVariable(mem, to);
                return;
            }
            if (FBTrace.DBG_FIRECLOSURE)
                FBTrace.sysout("FireClosure; setScopedVariableF didn't find anything");
        }
        catch (e) {
            if (FBTrace.DBG_FIRECLOSURE)
                FBTrace.sysout("FireClosure; setScopedVariableF failed", e);
            throw e;
        }
        throw new Error("Can't set non-existent closure variables.");
    },

    getScopedVariablesF: function(obj)
    {
        var ret = [];
        try {
            for (var sc = obj.environment; sc; sc = sc.parent) {
                if ((sc.type === "object" || sc.type === "with")
                        && sc.getVariable("profileEnd")) {
                    // Almost certainly the with(_FirebugCommandLine) block,
                    // which is at the top of the scope chain on objects
                    // defined through the console. Hide it for a nicer display.
                    break;
                }
                if (sc.type === "object" && sc.getVariable("Object")) {
                    // Almost certainly the window object, which we don't need.
                    break;
                }
                ret.push(sc.names());
            }
        }
        catch (e) {
            if (FBTrace.DBG_FIRECLOSURE)
                FBTrace.sysout("FireClosure; getScopedVariablesF failed", e);
        }
        return ret;
    },

    scopeIsInteresting: function(env)
    {
        return env && env.type !== "object";
    },

    generalize: function(functionName, defaultValue)
    {
        var self = this;
        var functionSpecific = this[functionName + 'F'];
        var general = this[functionName + 'A'] = function(obj) {
            if (obj.environment) {
                return functionSpecific.apply(this, arguments);
            }
            else {
                var first = true;
                for (;;) {
                    var names = obj.getOwnPropertyNames(), pd;
                    for (var i = 0; i < names.length; ++i) {
                        // We assume that the first own property, or the first
                        // enumerable property of the prototype, that is a
                        // function with some scope (i.e., it is interpreted,
                        // JSScript-backed, and without optimized-away scope)
                        // shares this scope with 'obj'.

                        try {
                            pd = obj.getOwnPropertyDescriptor(names[i]);
                        }
                        catch (e) {
                            // getOwnPropertyDescriptor sometimes fails with
                            // "Illegal operation on WrappedNative prototype object",
                            // for instance on [window].proto.gopd('localStorage').
                            continue;
                        }
                        if (!pd || pd.get || pd.set || (!first && !pd.enumerable))
                            continue;
                        var f = pd.value;
                        if (!f || !self.scopeIsInteresting(f.environment))
                            continue;
                        var args = [].slice.call(arguments);
                        args[0] = f;
                        return functionSpecific.apply(this, args);
                    }

                    if (!first)
                        break;
                    first = false;
                    obj = obj.proto;
                    if (!obj) break;
                }
                return defaultValue;
            }
        };

        this[functionName] = function(global, obj /*, ... */) {
            // Avoid 'window' and 'document' getting associated with closures.
            if (obj === global || obj === global.document)
                return defaultValue;

            var dglobal = self.getDebuggerGlobal(global);
            if (!dglobal)
                return defaultValue;

            obj = dglobal.makeDebuggeeValue(obj);
            if (!obj || typeof obj !== 'object')
                return defaultValue;

            var args = [].slice.call(arguments, 1);
            args[0] = obj;
            return general.apply(this, args);
        };
    },

    getScopedVarsWrapper: function(global, obj)
    {
        var dglobal = this.getDebuggerGlobal(global);
        if (!dglobal)
            throw new Error("Debugger not available.");

        obj = dglobal.makeDebuggeeValue(obj);
        if (!obj || typeof obj !== 'object')
            throw new Error("Tried to get scope of non-object.");

        // Return a wrapper for its scoped variables.
        var self = this;
        var handler = {};
        handler.getOwnPropertyDescriptor = function(name) {
            if (name === "__exposedProps__") {
                // Expose mostly everything, rw, through another proxy.
                return {
                    value: Proxy.create({
                        getPropertyDescriptor: function(name) {
                            if (name === "__exposedProps__" || name === "__proto__")
                                return;
                            return {value: 'rw', enumerable: true};
                        }
                    })
                };
            }

            return {
                get: function() {
                    try {
                        var ret = self.getScopedVariableA(obj, name);
                        return self.unwrap(global, dglobal, ret);
                    }
                    catch(e) {
                        if (FBTrace.DBG_FIRECLOSURE)
                            FBTrace.sysout("FireClosure; failed to return value from getter", e);
                    }
                },

                set: function(value) {
                    value = dglobal.makeDebuggeeValue(value);
                    self.setScopedVariableA(obj, name, value);
                }
            };
        };
        handler.getPropertyDescriptor = handler.getOwnPropertyDescriptor;
        return Proxy.create(handler);
    },

    initialize: function()
    {
        if (FBTrace.DBG_FIRECLOSURE)
            FBTrace.sysout("FireClosure; extension initialize");

        this.generalize('getScopedVariables', []);
        this.generalize('getScopedVariable', undefined);
        this.generalize('setScopedVariable', undefined);
        this.generalize('getScope', null);
    },

    shutdown: function()
    {
        if (FBTrace.DBG_FIRECLOSURE)
            FBTrace.sysout("FireClosure; extension shutdown");

        // Unregister all registered Firebug components
        Firebug.unregisterModule(Firebug.FireClosureModule);
        Firebug.unregisterStylesheet("chrome://fireclosure/skin/fireclosure.css");
    }
};

// ********************************************************************************************* //

Firebug.FireClosure = FireClosure;
return FireClosure;

// ********************************************************************************************* //
});
