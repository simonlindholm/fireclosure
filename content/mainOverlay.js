/* See license.txt for terms of usage */

// Register trace listener the customizes trace logs coming from this extension.
Firebug.registerTracePrefix("FireClosure;", "DBG_FIRECLOSURE", true,
    "chrome://fireclosure/skin/fireclosure.css");

// Register the extension. The 'main' module is loaded automatically.
var config = {id: "fireclosure@simonsoftware.se"};
Firebug.registerExtension("fireclosure", config);
