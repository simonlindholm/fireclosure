#define UINT32_MAX (0xffffffffU)
#include <jsapi.h>
#include <jsfriendapi.h>
#include <jsdbgapi.h>
#include <nsIXPConnect.h>
#include "fake-decl.h"
#include "util.h"

NS_IMPL_ISUPPORTS1(nsFireClosureUtils, nsIFireClosureUtils)

NS_IMETHODIMP
nsFireClosureUtils::GetParentScope(const JS::Value& val, JSContext* cx, JS::Value* out)
{
    if (JSVAL_IS_PRIMITIVE(val))
        return NS_ERROR_XPC_BAD_CONVERT_JS;
    JSObject* obj = JSVAL_TO_OBJECT(val);

    // I don't know if cx really is the context of 'unwrapped', but it might
    // work anyway since it often isn't used.
    JSContext* fakeCx = cx;

    // The object is generally wrapped up in security wrappers or so.
    JSObject* unwrapped = JS_UnwrapObject(obj);

    JSObject* scope = 0;
    {
        // Enter 'unwrapped's compartment; I think this is necessary.
        JSAutoEnterCompartment ae;
        if (!ae.enter(fakeCx, unwrapped)) {
            return NS_ERROR_FAILURE;
        }

        scope = JS_GetParentOrScopeChain(fakeCx, unwrapped);

        // Outerize (necessary?)
        if (scope) {
            if (JSObjectOp outerize = js::GetObjectClass(scope)->ext.outerObject) {
                scope = outerize(fakeCx, scope);
            }
        }
    }

    if (!scope)
        return NS_ERROR_FAILURE; // dunno

    // Wrap the value back, I guess.
    JS_WrapObject(cx, &scope);

    *out = OBJECT_TO_JSVAL(scope);
    return NS_OK;
}

NS_IMETHODIMP
nsFireClosureUtils::GetScope(const JS::Value& val, JSContext* cx, JS::Value* out)
{
    if (JSVAL_IS_PRIMITIVE(val))
        return NS_ERROR_XPC_BAD_CONVERT_JS;
    JSObject* obj = JSVAL_TO_OBJECT(val);

    JSContext* fakeCx = cx;
    JSObject* unwrapped = JS_UnwrapObject(obj);

    JSObject* scope = 0;
    {
        JSAutoEnterCompartment ae;
        if (!ae.enter(fakeCx, unwrapped)) {
            return NS_ERROR_FAILURE;
        }

        if (JS_ObjectIsFunction(fakeCx, unwrapped)) { // unwrapped->isFunction()
            // JSFunction* f = unwrapped->toFunction();
            JS::Value fval = OBJECT_TO_JSVAL(unwrapped);
            JSFunction* f = JS_ValueToFunction(fakeCx, fval);
            if (JS_GetFunctionScript(fakeCx, f)) { // f->isInterpreted()
                scope = f->environment();
            }
        }
    }

    if (scope) {
        // I guess we need to wrap the value back. This might need additional
        // security wrappers that I don't know how to get to.
        JS_WrapObject(cx, &scope);
        *out = OBJECT_TO_JSVAL(scope);
    }
    else {
        *out = JS::UndefinedValue();
    }
    return NS_OK;
}

nsFireClosureUtils::nsFireClosureUtils() {}
nsFireClosureUtils::~nsFireClosureUtils() {}
