/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "fireclosure/module",
],
function(FBTrace, Module) {

var FireClosure =
{
    gotUtils: false,
    utils: null,

    initUtils: function()
    {
        if (!this.gotUtils) {
            this.gotUtils = true;
            var {classes: Cc, interfaces: Ci} = Components;
            var cl = Cc['@simonsoftware.se/nsFireClosureUtils;1'];
            if (cl) {
                try {
                    var inst = cl.createInstance();
                    this.utils = inst.QueryInterface(Ci.nsIFireClosureUtils);
                    if (!this.utils)
                        throw new Error("QI failed.");
                }
                catch(e) {
                    if (FBTrace.DBG_FIRECLOSURE)
                        FBTrace.sysout("FireClosure; binary component initialization failed", e);
                }
            }
            else {
                if (FBTrace.DBG_FIRECLOSURE)
                    FBTrace.sysout("FireClosure; no binary component available");
            }
        }
        return !!this.utils;
    },

    getScopedVariableFromFunction: function(obj, mem)
    {
        if (!this.initUtils())
            return undefined;

        try {
            var hasP = Object.prototype.hasOwnProperty;
            for (var sc = this.utils.getScope(obj), next; sc; sc = next) {
                var next = this.utils.getParentScope(sc);
                if (sc === next) {
                    // Topmost scope, break out of the loop.
                    break;
                }
                if (hasP.call(sc, mem)) return sc[mem];
            }
            if (FBTrace.DBG_FIRECLOSURE)
                FBTrace.sysout("FireClosure; getScopedVariableFromFunction didn't find anything");
        }
        catch(e) {
            if (FBTrace.DBG_FIRECLOSURE)
                FBTrace.sysout("FireClosure; getScopedVariableFromFunction failed", e);
        }

        // Nothing found, for whatever reason.
        return undefined;
    },

    setScopedVariableFromFunction: function(obj, mem, to)
    {
        if (!this.initUtils())
            return;

        try {
            var hasP = Object.prototype.hasOwnProperty;
            for (var sc = this.utils.getScope(obj), next; sc; sc = next) {
                var next = this.utils.getParentScope(sc);
                if (sc === next) {
                    // Topmost scope, break out of the loop.
                    break;
                }
                if (hasP.call(sc, mem)) {
                    sc[mem] = to;
                    return;
                }
            }
            if (FBTrace.DBG_FIRECLOSURE)
                FBTrace.sysout("FireClosure; setScopedVariableFromFunction didn't find anything");
        }
        catch(e) {
            if (FBTrace.DBG_FIRECLOSURE)
                FBTrace.sysout("FireClosure; setScopedVariableFromFunction failed", e);
            throw e;
        }
        throw new Error("Can't set non-existent properties.");
    },

    getScopedVariablesFromFunction: function(obj)
    {
        if (!this.initUtils())
            return [];

        try {
            var ret = [];
            for (var sc = this.utils.getScope(obj), next; sc; sc = next) {
                next = this.utils.getParentScope(sc);
                if (sc === next) {
                    // Topmost scope, break out of the loop.
                    break;
                }

                var part = [];
                for (var mem in sc) {
                    part.push(mem);
                }
                ret.push(part);
            }
            return ret;
        }
        catch(e) {
            if (FBTrace.DBG_FIRECLOSURE)
                FBTrace.sysout("FireClosure; getScopedVariablesFromFunction failed", e);
            return [];
        }
    },

    generalize: function(functionSpecific, defaultValue)
    {
        return function(obj) {
            if (typeof obj === 'function') {
                return functionSpecific.apply(this, arguments);
            }
            else {
                for (var a in obj) {
                    // We assume that the first function found is interpreted,
                    // is backed by a JSScript, and shares the same scope as 'obj'.
                    var f = obj[a];
                    if (typeof f === 'function') {
                        var args = [].slice.call(arguments);
                        args[0] = f;
                        return functionSpecific.apply(this, args);
                    }
                }
                return defaultValue;
            }
        };
    },

    initialize: function()
    {
        if (FBTrace.DBG_FIRECLOSURE)
            FBTrace.sysout("FireClosure; extension initialize");

        this.getScopedVariables = this.generalize(this.getScopedVariablesFromFunction, []);
        this.getScopedVariable = this.generalize(this.getScopedVariableFromFunction, undefined);
        this.setScopedVariable = this.generalize(this.setScopedVariableFromFunction, undefined);
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
