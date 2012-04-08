/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "fireclosure/module",
],
function(FBTrace, Module) {

var FireClosure =
{
    hasInit: false,
    dbg: null,

    getDebuggerGlobal: function(global)
    {
        if (!this.hasInit) {
            this.hasInit = true;
            var {classes: Cc, interfaces: Ci} = Components;
            try {
                var cl = Cc['@mozilla.org/jsdebugger;1'];
                var inst = cl.createInstance();
                var dbg = inst.QueryInterface(Ci.IJSDebugger);
                dbg.addClass();

                // Monkey-patch Debugger some.
                if (!Debugger.Object.prototype.getProperty) {
                    Debugger.Object.prototype.getProperty = function(prop) {
                        var pd = this.getOwnPropertyDescriptor(prop);
                        if (!pd)
                            return undefined;
                        if (pd.get || pd.set)
                            return undefined; // or throw a DebuggeeWouldRun, but whatever
                        return pd.value;
                    };
                }
                if (!Debugger.Object.prototype.setProperty) {
                    Debugger.Object.prototype.setProperty = function(prop, value) {
                        var pd = this.getOwnPropertyDescriptor(prop);
                        if (!pd) {
                            pd = { writable: true, configurable: true, enumerable: true };
                        }
                        else {
                            if (pd.set)
                                return undefined; // or throw a DebuggeeWouldRun, but whatever
                            if (pd.get || !pd.writable)
                                return undefined; // or throw an error, but whatever
                        }
                        pd.value = value;
                        this.defineProperty(prop, pd);
                    };
                }

                this.dbg = new Debugger;
                this.dbg.enabled = false;
                if (FBTrace.DBG_FIRECLOSURE)
                    FBTrace.sysout("FireClosure; got debugger", this.dbg);
            }
            catch(e) {
                if (FBTrace.DBG_FIRECLOSURE)
                    FBTrace.sysout("FireClosure; debugger initialization failed", e);
            }
        }

        if (!this.dbg)
            return null;
        var dglobal = this.dbg.addDebuggee(global);
        return dglobal;
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
        catch(e) {
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
        catch(e) {
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
                if ((sc.type === "object" || sc.type === "with") // "with" is unimplemented
                        && sc.getVariable("_scopedVars")) {
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
        catch(e) {
            if (FBTrace.DBG_FIRECLOSURE)
                FBTrace.sysout("FireClosure; getScopedVariablesF failed", e);
        }
        return ret;
    },

    hasInterestingScope: function(obj)
    {
        var env = obj.environment;
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
                var names = obj.getOwnPropertyNames();
                for (var i = 0; i < names.length; ++i) {
                    // We assume that the first own member function that is in
                    // a scope at all (interpreted, JSScript-backed, without
                    // optimized-away scope) shares this scope with 'obj'.
                    // TODO: Check also enumerable properties of the object's
                    // prototype.

                    var f = obj.getProperty(names[i]);
                    if (!f || !self.hasInterestingScope(f))
                        continue;
                    var args = [].slice.call(arguments);
                    args[0] = f;
                    return functionSpecific.apply(this, args);
                }
                return defaultValue;
            }
        };

        this[functionName] = function(global, obj /*, ... */) {
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
                        dglobal.setProperty('_getScopeRet', ret);
                        return global._getScopeRet;
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
