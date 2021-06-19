const MODULE_ID = "bad-ideas-toolkit";

Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    registerPackageDebugFlag(MODULE_ID);
});


//logging
function log(...args) {
    try {
        const isDebugging = window.DEV?.getPackageDebugValue(MODULE_ID);

        if (isDebugging) {
            console.log(MODULE_ID, '|', ...args);
        }
    } catch (e) {}
}

Hooks.once('init', async function() {
    //socket registration
    game.socket.on(`module.${MODULE_ID}`, async (data) => {
        log("Received data over socket:", data)
        if(data.operation === "return"){
            if(data.retVal.isUuid){
                data.retVal.result = fromEUuid(data.retVal.result)
            }
            if(data.retVal.isUuidArray){
                data.retVal.result = data.retVal.result.map(fromEUuid)
            }
            const resolve = _requestResolvers[data.randomID];
            if (resolve){
                delete _requestResolvers[data.randomID];
                resolve(data.retVal)
            }
        } else {
            const handlerFunction = data.operation+"Handler"
            handlers[handlerFunction](data);
        }
    });

    //API registration
    game.modules.get(MODULE_ID).api = api
    if(!globalThis.badIdeas) {
        globalThis.badIdeas = api
        log("badIdeas convenience object registered successfully")
    } else {
        ui.notifications.warn(`badIdeas convenience object not registerable.  Bad Ideas Toolkit API is still accessible via game.modules.get(${MODULE_ID}).api`)
    }//register convenience object if it's not already in use
});



const _requestResolvers = {};

const api = {
    isMainGM(){
        return game.user === game.users.find((u) => u.isGM && u.active)
    },

    // old API, kept for compatibility and not needing to rewrite a million macros
    async applyCUBCondition(condition,entity) {
        if(!game.modules.get("combat-utility-belt")?.active) return false;
        let document = getDocument(entity);
        const content = {condition, document};
        return handlerBridge(content, "applyCUBCondition")
    },

    async removeCUBCondition(condition,entity){
        if(!game.modules.get("combat-utility-belt")?.active) return false;
        let document = getDocument(entity);
        const content = {condition, document};
        return handlerBridge(content, "removeCUBCondition")
    },

    async entityGetFlag(entity, scope, flag){
        let document = getDocument(entity);
        return this.documentGetFlag(document, scope, flag)
    },

    async entitySetFlag(entity, scope, flag, value){
        let document = getDocument(entity);
        return this.documentSetFlag(document, scope, flag, value)
    },

    async entityUnsetFlag(entity, scope, flag){
        let document = getDocument(entity);
        return this.documentUnsetFlag(document, scope, flag)
    },

    async entityUpdate(entity, newData, options){
        let document = getDocument(entity);
        return this.documentUpdate(document, newData, options)
    },

    async entityDelete(entity, options){
        let document = getDocument(entity);
        return this.documentDelete(document, options)
    },

    async entityCreateEmbeddedEntity(entity, embedType, embedData, options){
        let document = getDocument(entity);
        if(!Array.isArray(embedData)) embedData = [embedData]
        return this.documentCreateEmbeddedDocuments(document, embedType, embedData, options)
    },

    async entityDeleteEmbeddedEntity(entity, embedType, embedIds, options){
        let document = getDocument(entity);
        if(!Array.isArray(embedIds)) embedIds = [embedIds]
        return this.documentDeleteEmbeddedDocuments(document, embedType, embedIds, options)
    },

    //0.8 API.  Mostly just functions which the old ones will pass into (except for handling the embedded changes), but using the new naming scheme
    async documentGetFlag(document, scope, flag){
        const content = {document, scope,flag};
        return handlerBridge(content,"documentGetFlag")
    },

    async documentSetFlag(document, scope, flag, value){
        const content = {document, scope,flag, value};
        return handlerBridge(content,"documentSetFlag")
    },

    async documentUnsetFlag(document, scope, flag){
        const content = {document, scope,flag};
        return handlerBridge(content,"documentUnsetFlag")
    },

    async documentUpdate(document, newData, options){
        const content = {document, newData, options};
        return handlerBridge(content,"documentUpdate")
    },

    async documentDelete(document, options){
        const content = {document, options};
        return handlerBridge(content,"documentDelete")
    },

    async documentCreateEmbeddedDocuments(document, embedType, embedData, options){
        const content = {document, embedType, embedData, options};
        return handlerBridge(content,"documentCreateEmbeddedDocuments")
    },

    async documentDeleteEmbeddedDocuments(document, embedType, embedIds, options){
        const content = {document, embedType, embedIds, options};
        return handlerBridge(content,"documentDeleteEmbeddedDocuments")
    },


//entityfromUuid removed due to document changes.
}

function getDocument(entity, skipCheck){// gets the document if it was passed a PO, otherwise just returns the argument.  Will check if the result is a document unless passed "true"
    let document;
    if(entity instanceof PlaceableObject){
         document = entity.document
    } else {
        document = entity
    }
    if(document instanceof foundry.abstract.Document || skipCheck){
        return document
    } else throw new Error(`${MODULE_ID}| Object provided was not a Document or reducible to one.`)
}

function getUniqueID(){
    return `${game.user.id}-${Date.now()}-${randomID()}`
}

function extendedUuid(document){
    let euuid = document.uuid
    if(document.documentName === "Actor" && !document.uuid.includes("Actor")){
        euuid += ".Actor"
    }
    return euuid
}

async function fromEUuid(euuid){
    let parts = euuid?.split(".");
    let isActor = false;
    if(parts?.pop()==="Actor"){ //remove the last element of the array, and check if it's an Actor, and if so reconstruct the euuid without it
        euuid = parts.join(".")
        isActor = true
    }
    let document = await fromUuid(euuid)
    if(isActor) document = document.actor

    return document
}

async function handlerBridge(content, functionName){  //if the user is the main GM, executes the handler directly.  otherwise, emits an instruction to execute over a socket.
    log("handlerBridge called with arguments", ...arguments)
    const methodResponse = await new Promise((resolve, reject) => {
        const randomID = getUniqueID();
        _requestResolvers[randomID] = resolve;
        const user = game.user.id;
        content.document = extendedUuid(content.document)
        if ((!content.userID && api.isMainGM() ) || content.userID === user){ //if content doesn't specify a user, this is to be run by the GM.  If it does, it's to be run by the user specified
            const handlerFunctionName = `${functionName}Handler`
            handlers[handlerFunctionName]({content, randomID, user})
        }else{
            game.socket.emit(`module.${MODULE_ID}`, {
                operation: functionName,
                user,
                content,
                randomID
            })
        }
        setTimeout(() =>{
            delete _requestResolvers[randomID];
            reject(new Error ("timed out waiting for GM execution"));
        }, 5000)
    })

    if (methodResponse.error)
        throw new Error(methodResponse.error)
    else
        return methodResponse.result;
}

function returnBridge(retVal, data){
    log("return bridge called with arguments", ...arguments)
    if (data.user === game.user.id){
        const resolve = _requestResolvers[data.randomID];
            if (resolve){
                delete _requestResolvers[data.randomID];
                resolve(retVal)
            }
        return;
    }
    if(retVal.result instanceof foundry.abstract.Document) { //if it's a document or an array of documents, decompose it to its eUUIDs
        retVal.result = extendedUuid(retVal.result);
        retVal.isUuid = true
    } else if (Array.isArray(retVal.result) && retVal.result.every( (res) => res instanceof foundry.abstract.Document)){ //if something ends up returning an array of some documents and some notdocuments, it'll get the return value wrong in the end, but that shouldn't happen.
        retVal.isUuidArray = true
        retVal.result = retVal.result.map(extendedUuid)
    }
    game.socket.emit(`module.${MODULE_ID}`, {
        operation: "return",
        user: game.user.id,
        retVal,
        randomID: data.randomID
    })
}

const handlers = {
    async applyCUBConditionHandler(data){
        if(!api.isMainGM()) return;
        const condition = data.content.condition;
        const document = await fromEUuid(data.content.document)
        const retVal = {}
        retVal.result = await game.cub.addCondition(condition, document)
        returnBridge(retVal, data)
    },

    async removeCUBConditionHandler(data){
        if(!api.isMainGM()) return;
        const condition = data.content.condition;
        const document = await fromEUuid(data.content.document)
        const retVal = {}
        retVal.result = await game.cub.removeCondition(condition, document)
        returnBridge(retVal, data)
    },

    async documentGetFlagHandler(data){
        if(!api.isMainGM()) return;
        const document = await fromEUuid(data.content.document)
        const retVal = {}
        retVal.result = await document.getFlag(data.content.scope, data.content.flag)
        returnBridge(retVal, data)
    },

    async documentSetFlagHandler(data){
        if(!api.isMainGM()) return;
        const document = await fromEUuid(data.content.document)
        const retVal = {}
        retVal.result = await document.setFlag(data.content.scope, data.content.flag, data.content.value)
        returnBridge(retVal, data)
    },

    async documentUnsetFlagHandler(data){
        if(!api.isMainGM()) return;
        const document = await fromEUuid(data.content.document)
        const retVal = {}
        retVal.result = await document.unsetFlag(data.content.scope, data.content.flag)
        returnBridge(retVal, data)
    },

    async documentUpdateHandler(data){
        if(!api.isMainGM()) return;
        const document = await fromEUuid(data.content.document)
        const retVal = {}
        retVal.result = await document.update(data.content.newData, data.content.options)
        returnBridge(retVal, data)
    },

    async documentDeleteHandler(data){
        if(!api.isMainGM()) return;
        const document = await fromEUuid(data.content.document)
        const retVal = {}
        retVal.result = await document.delete(data.content.options)
        returnBridge(retVal, data)
    },

    async documentCreateEmbeddedDocumentsHandler(data){
        if(!api.isMainGM()) return;
        const document = await fromEUuid(data.content.document)
        const retVal = {}
        retVal.result = await document.createEmbeddedDocuments(data.content.embedType, data.content.embedData, data.content.options)
        returnBridge(retVal, data)
    },

    async documentDeleteEmbeddedDocumentsHandler(data){
        if(!api.isMainGM()) return;
        const document = await fromEUuid(data.content.document)
        const retVal = {}
        retVal.result = await document.deleteEmbeddedDocuments(data.content.embedType, data.content.embedIds, data.content.options)
        returnBridge(retVal, data)
    }
}