#include <mozilla/ModuleUtils.h>
#include "util.h"

NS_GENERIC_FACTORY_CONSTRUCTOR(FireClosureUtils)

NS_DEFINE_NAMED_CID(MY_COMPONENT_CID);

static const mozilla::Module::CIDEntry kMyComponentCIDs[] = {
    { &kMY_COMPONENT_CID, false, NULL, FireClosureUtilsConstructor },
    { NULL }
};

static const mozilla::Module::ContractIDEntry kMyComponentContracts[] = {
    { MY_COMPONENT_CONTRACTID, &kMY_COMPONENT_CID },
    { NULL }
};

static const mozilla::Module kMyComponentModule = {
    mozilla::Module::kVersion,
    kMyComponentCIDs,
    kMyComponentContracts,
    NULL
};

NSMODULE_DEFN(NS_FireClosureUtils_Module) = &kMyComponentModule;
