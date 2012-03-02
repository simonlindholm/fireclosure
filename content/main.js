/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "fireclosure/module",
],
function(FBTrace, Module) {

var FireClosure =
{
    initialize: function()
    {
        if (FBTrace.DBG_FIRECLOSURE)
            FBTrace.sysout("FireClosure; extension initialize");

        // TODO: Extension initialization
    },

    shutdown: function()
    {
        if (FBTrace.DBG_FIRECLOSURE)
            FBTrace.sysout("FireClosure; extension shutdown");

        // Unregister all registered Firebug components
        Firebug.unregisterModule(Firebug.FireClosureModule);
        Firebug.unregisterStylesheet("chrome://fireclosure/skin/fireclosure.css");

        // TODO: Extension shutdown
    }
}

// ********************************************************************************************* //

return FireClosure;

// ********************************************************************************************* //
});
