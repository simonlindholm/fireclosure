#define UINT32_MAX (0xffffffffU)
#include <jsapi.h>
#include <jsfriendapi.h>
#include <jsdbgapi.h>
#include <nsIXPConnect.h>
#include "util.h"

// This is basically nsDOMWindowUtils::getParent() and some unwrapping,
// available under MPL2.

NS_IMPL_ISUPPORTS1(nsFireClosureUtils, nsIFireClosureUtils)

NS_IMETHODIMP
nsFireClosureUtils::GetParentThroughWrappers(const JS::Value& val, JSContext* cx, JS::Value* out)
{
    // XXX maybe I need JSAutoRequest

    // First argument must be an object.
    if (JSVAL_IS_PRIMITIVE(val)) {
        return NS_ERROR_XPC_BAD_CONVERT_JS;
    }

    JSObject* obj = JSVAL_TO_OBJECT(val);

    // jswrapper.h has the alternative UnwrapObject, also obj->unwrap() should
    // given the class definition.
    JSObject* unwrapped = JS_UnwrapObject(obj);

    // I don't know if cx really is the context of 'unwrapped', but it might
    // work anyway since it often isn't used.
    // (JS_GetParentOrScopeChain doesn't use the context, for example.)
    JSContext* fakeCx = cx;

    JSObject* parent;

    {
        // Enter 'unwrapped's compartment; I think this is necessary.
        JSAutoEnterCompartment ae;
        if (!ae.enter(fakeCx, unwrapped)) {
            return NS_ERROR_FAILURE;
        }

        JSObject* parent = JS_GetParent(fakeCx, unwrapped);

        // Outerize if necessary.
        if (parent) {
            if (JSObjectOp outerize = js::GetObjectClass(parent)->ext.outerObject) {
                parent = outerize(cx, parent);
            }
        }
    }

    // I guess we need to wrap the value back. This might need additional
    // security wrappers that I don't know how to get to.
    JS_WrapObject(cx, &parent);

    *out = OBJECT_TO_JSVAL(parent);
    return NS_OK;
}

nsFireClosureUtils::nsFireClosureUtils() {}
nsFireClosureUtils::~nsFireClosureUtils() {}
