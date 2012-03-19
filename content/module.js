/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/trace",
    "firebug/console/commandLine",
    "firebug/console/commandLineExposed",
    "fireclosure/autoCompleter",
],
function(Obj, FBTrace, CommandLine, CommandLineExposed, AutoCompleter) {

// ********************************************************************************************* //
// Custom Module Implementation

Firebug.FireClosureModule = Obj.extend(Firebug.Module,
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(owner)
    {
        Firebug.Module.initialize.apply(this, arguments);

        if (FBTrace.DBG_FIRECLOSURE)
            FBTrace.sysout("FireClosure; Module.initialize");

        // Override the event-passing evaluator by one that handles .% (it's
        // mainly that one which gets used, and the debugger one does not
        // currently inject the command line. (TODO: Change this?)
        var ev = CommandLine.evaluateByEventPassing;
        CommandLine.evaluateByEventPassing = function(expr) {
            var args = [].slice.call(arguments);
            args[0] = AutoCompleter.transformPrivVarExpr(expr);
            if (FBTrace.DBG_FIRECLOSURE && args[0] !== expr) {
                FBTrace.sysout("FireClosure; transforming expression: `" +
                        expr + "` -> `" +
                        args[0] + "`");
            }
            return ev.apply(CommandLine, args);
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
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        if (FBTrace.DBG_FIRECLOSURE)
            FBTrace.sysout("FireClosure; Module.shutdown");
    },

    showPanel: function(browser, panel)
    {
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.FireClosureModule);

return Firebug.FireClosureModule;

// ********************************************************************************************* //
});
