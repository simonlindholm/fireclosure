/*
 * DO NOT EDIT.  THIS FILE IS GENERATED FROM iutil.idl
 */

#ifndef __gen_iutil_h__
#define __gen_iutil_h__


#ifndef __gen_nsISupports_h__
#include "nsISupports.h"
#endif

#include "jspubtd.h"

/* For IDL files that don't want to include root IDL files. */
#ifndef NS_NO_VTABLE
#define NS_NO_VTABLE
#endif

/* starting interface:    IFireClosureUtils */
#define IFIRECLOSUREUTILS_IID_STR "4073f0b0-665c-11e1-b86c-0800200c9a66"

#define IFIRECLOSUREUTILS_IID \
  {0x4073f0b0, 0x665c, 0x11e1, \
    { 0xb8, 0x6c, 0x08, 0x00, 0x20, 0x0c, 0x9a, 0x66 }}

class NS_NO_VTABLE NS_SCRIPTABLE IFireClosureUtils : public nsISupports {
 public: 

  NS_DECLARE_STATIC_IID_ACCESSOR(IFIRECLOSUREUTILS_IID)

  /* [implicit_jscontext] jsval getParentThroughWrappers (in jsval obj); */
  NS_SCRIPTABLE NS_IMETHOD GetParentThroughWrappers(const JS::Value & obj, JSContext* cx, JS::Value *_retval NS_OUTPARAM) = 0;

};

  NS_DEFINE_STATIC_IID_ACCESSOR(IFireClosureUtils, IFIRECLOSUREUTILS_IID)

/* Use this macro when declaring classes that implement this interface. */
#define NS_DECL_IFIRECLOSUREUTILS \
  NS_SCRIPTABLE NS_IMETHOD GetParentThroughWrappers(const JS::Value & obj, JSContext* cx, JS::Value *_retval NS_OUTPARAM); 

/* Use this macro to declare functions that forward the behavior of this interface to another object. */
#define NS_FORWARD_IFIRECLOSUREUTILS(_to) \
  NS_SCRIPTABLE NS_IMETHOD GetParentThroughWrappers(const JS::Value & obj, JSContext* cx, JS::Value *_retval NS_OUTPARAM) { return _to GetParentThroughWrappers(obj, cx, _retval); } 

/* Use this macro to declare functions that forward the behavior of this interface to another object in a safe way. */
#define NS_FORWARD_SAFE_IFIRECLOSUREUTILS(_to) \
  NS_SCRIPTABLE NS_IMETHOD GetParentThroughWrappers(const JS::Value & obj, JSContext* cx, JS::Value *_retval NS_OUTPARAM) { return !_to ? NS_ERROR_NULL_POINTER : _to->GetParentThroughWrappers(obj, cx, _retval); } 

#if 0
/* Use the code below as a template for the implementation class for this interface. */

/* Header file */
class _MYCLASS_ : public IFireClosureUtils
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_IFIRECLOSUREUTILS

  _MYCLASS_();

private:
  ~_MYCLASS_();

protected:
  /* additional members */
};

/* Implementation file */
NS_IMPL_ISUPPORTS1(_MYCLASS_, IFireClosureUtils)

_MYCLASS_::_MYCLASS_()
{
  /* member initializers and constructor code */
}

_MYCLASS_::~_MYCLASS_()
{
  /* destructor code */
}

/* [implicit_jscontext] jsval getParentThroughWrappers (in jsval obj); */
NS_IMETHODIMP _MYCLASS_::GetParentThroughWrappers(const JS::Value & obj, JSContext* cx, JS::Value *_retval NS_OUTPARAM)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

/* End of implementation class template. */
#endif


#endif /* __gen_iutil_h__ */
