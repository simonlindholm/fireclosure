/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/trace",
    "fireclosure/autoCompleter",
],
function(Obj, FBTrace) {

// ********************************************************************************************* //
// Custom Module Implementation

Firebug.FireClosureModule = Obj.extend(Firebug.Module,
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(owner)
    {
        Firebug.Module.initialize.apply(this, arguments);

        // TODO: Module initialization (there is one module instance per browser window)

        if (FBTrace.DBG_FIRECLOSURE)
            FBTrace.sysout("FireClosure; Module.initialize");
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
