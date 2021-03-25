Hooks.once('init', async function() {
    game.socket.on(`module.bad-ideas-toolkit`, async (data) => {
        if(data.operation === "return"){
            const resolve = _requestResolvers[data.randomID];
            if (resolve){
                delete _requestResolvers[data.randomID];
                if(data.retVal.uuid) data.retVal.result = await api.entityFromUuid(data.retVal.result) //recompose from UUID if it was minified down to it
                resolve(data.retVal)
            }
        } else {
            const handlerFunction = data.operation+"Handler"
            handlers[handlerFunction](data);
        }
    });
    game.modules.get("bad-ideas-toolkit").api = api
    if(!globalThis.badIdeas) {globalThis.badIdeas = api} //register convenience object if it's not already in use
});

const _requestResolvers = {};

const api = {
    isMainGM(){
        return game.user === game.users.find((u) => u.isGM && u.active)
    },

    async applyCUBCondition(condition,entity) {
        if(!game.modules.get("combat-utility-belt")?.active) return false;
        let uuid = getExtendedUuid(entity);
        const content = {condition, uuid};
        return handlerBridge(content, "applyCUBCondition")
    },

    async removeCUBCondition(condition,entity){
        if(!game.modules.get("combat-utility-belt")?.active) return false;
        let uuid = getExtendedUuid(entity);
        const content = {condition, uuid};
        return handlerBridge(content, "removeCUBCondition")
    },

    async entityGetFlag(entity, scope, flag){
        let uuid = getExtendedUuid(entity);
        const content = {uuid, scope,flag};
        return handlerBridge(content,"entityGetFlag")
    },

    async entitySetFlag(entity, scope, flag, value){
        let uuid = getExtendedUuid(entity);
        const content = {uuid, scope,flag, value};
        return handlerBridge(content,"entitySetFlag")
    },

    async entityUnsetFlag(entity, scope, flag){
        let uuid = getExtendedUuid(entity);
        const content = {uuid, scope,flag};
        return handlerBridge(content,"entityUnsetFlag")
    },

    async entityUpdate(entity, newData, options){
        let uuid = getExtendedUuid(entity);
        const content = {uuid, newData, options};
        return handlerBridge(content,"entityUpdate")
    },

    async entityDelete(entity, options){
        let uuid = getExtendedUuid(entity);
        const content = {uuid, options};
        return handlerBridge(content,"entityDelete")
    },

    async entityCreateEmbeddedEntity(entity, embedType, embedData, options){
        let uuid = getExtendedUuid(entity);
        const content = {uuid, embedType, embedData, options};
        return handlerBridge(content,"entityCreateEmbeddedEntity")
    },

    async entityDeleteEmbeddedEntity(entity, embedType, embedData, options){
        let uuid = getExtendedUuid(entity);
        const content = {uuid, embedType, embedData, options};
        return handlerBridge(content,"entityDeleteEmbeddedEntity")
    },
    /* work in progress - need a solution to pass the dialog back across the socket and pick it up properly.
    async dialogToUser(userID, data, options){
        const buttonKeys = Object.keys(data.buttons)
        const callbacks = {};
        buttonKeys.forEach(k =>{
            let call = data.buttons.[k].callback;
            if(call) {
                callbacks[k] = duplicate(call);
                call = html =>
            }

        })
        const content = {userID,data,options}
        return handlerBridge(content,"dialogToUser")
    },*/
    
    async entityFromUuid(uuid){ //allows recovery of the actual Entity instance from a uuid, even for embedded entities.
        const sections = uuid.split(".");
        let type = sections[0]
        let id = sections[1]
        if (type === "JournalEntry") type = "journal"; //because someone had to be special, so we need to adjust this for the game lookup
        if (type === "Compendium" || type === "Folder") return fromUuid(uuid); //it's in a compendium, not handled by me, and this seems to be the best way to find a folder!
        let entity = game[type.toLowerCase()+"s"].get(id) //lookup in game, to avoid database call
        let index = 2;
        while (index<sections.length){
            index+=2;
            type = sections[index-2];
            id = sections[index-1]
            let data;
            switch (type){
                case "Item":
                    data = entity.items.get(id)
                    entity = Item.createOwned(data,entity);
                    break;
                case "ActiveEffect":
                    data = entity.effects.get(id)
                    entity = new ActiveEffect(data, entity);
                    break;
                case "Tile":
                    data = entity.data.tiles.find(t=>t._id === id)
                    entity = new Tile(data, entity);
                    break;
                case "Token":
                    data = entity.data.tokens.find(t=>t._id === id)
                    entity = new Token(data, entity);
                    break;
                case "Drawing":
                    data = entity.data.drawings.find(t=>t._id === id)
                    entity = new Drawing(data, entity);
                    break;
                case "MeasuredTemplate":
                    data = entity.data.templates.find(t=>t._id === id)
                    entity = new MeasuredTemplate(data, entity);
                    break;
                case "AmbientLight":
                    data = entity.data.lights.find(t=>t._id === id)
                    entity = new AmbientLight(data, entity);
                    break;
                case "AmbientSound":
                    data = entity.data.sounds.find(t=>t._id === id)
                    entity = new AmbientSound(data, entity);
                    break;
                case "Wall":
                    data = entity.data.walls.find(t=>t._id === id)
                    entity = new Wall(data, entity);
                    break;
                case "Note":
                    data = entity.data.notes.find(t=>t._id === id)
                    entity = new Note(data, entity);
                    break;
                default:
                    throw "Error: Unsupported Embedded Entity Type (BadIdeas Toolkit)"
            }
        }
        return entity;
    }
}

function getExtendedUuid(entity){// gets a uuid, with extensions for token.actor, and for active effects.  Private for now, could add it into the API if others want this public.
    if(entity instanceof ActiveEffect){ //active effects don't normally have an UUID, let's give them one
        let ownID = "ActiveEffect."+entity.id;
        let parentID = getExtendedUuid(entity.parent);
        return parentID+"."+ownID
    }
    if(entity instanceof Item && entity.isOwned && entity.options.actor.isToken){ //owned items might hit the issue below with token actors
        let ownID = "Item." + entity.id;
        let parentID = getExtendedUuid(entity.options.actor) //recurse here, to get the extended UUID for the actor
        return parentID+"."+ownID
    }
    if(entity instanceof Actor && entity.isToken){ //uuid for a token actor would normally resolve into the uuid of the actor in the sidebar
        let ownID = entity.uuid;
        let parentID = entity.token.uuid;
        return parentID+"."+ownID
    }
    return entity.uuid
}
function getUniqueID(){
    return `${game.user.id}-${Date.now()}-${randomID()}`
}

async function handlerBridge(content, functionName){  //if the user is the main GM, executes the handler directly.  otherwise, emits an instruction to execute over a socket.
    const methodResponse = await new Promise((resolve, reject) => {
        const randomID = getUniqueID();
        _requestResolvers[randomID] = resolve;
        const user = game.user.id;
        if ((!content.userID && api.isMainGM() ) || content.userID === user){ //if content doesn't specify a user, this is to be run by the GM.  If it does, it's to be run by the user specified
            const handlerFunctionName = `${functionName}Handler`
            handlers[handlerFunctionName]({content, randomID, user})
        }else{ 
            game.socket.emit('module.bad-ideas-toolkit', {
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
    console.log(retVal)
    if (retVal.result.uuid || (retVal.result instanceof ActiveEffect && retVal.result.parent)){ //if it has one, or is an active effect, decompose it to its UUID
        retVal.result = getExtendedUuid(retVal.result.uuid);
        retVal.uuid = true
    }
    console.log(retVal)
    if (data.user === game.user.id){
        const resolve = _requestResolvers[data.randomID];
            if (resolve){
                delete _requestResolvers[data.randomID];
                resolve(retVal)
            }
        return;
    }
    game.socket.emit("module.bad-ideas-toolkit", {
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
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await game.cub.addCondition(condition, entity)
        returnBridge(retVal, data)
    },

    async removeCUBConditionHandler(data){
        if(!api.isMainGM()) return;
        const condition = data.content.condition;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await game.cub.removeCondition(condition, entity)
        returnBridge(retVal, data)
    },

    async entityGetFlagHandler(data){
        if(!api.isMainGM()) return;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await entity.getFlag(data.content.scope, data.content.flag)
        returnBridge(retVal, data)
    },

    async entitySetFlagHandler(data){
        if(!api.isMainGM()) return;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await entity.setFlag(data.content.scope, data.content.flag, data.content.value)
        returnBridge(retVal, data)
    },

    async entityUnsetFlagHandler(data){
        if(!api.isMainGM()) return;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await entity.unsetFlag(data.content.scope, data.content.flag)
        returnBridge(retVal, data)
    },

    async entityUpdateHandler(data){
        if(!api.isMainGM()) return;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await entity.update(data.content.newData, data.content.options)
        returnBridge(retVal, data)
    },

    async entityDeleteHandler(data){
        if(!api.isMainGM()) return;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await entity.delete(data.content.options)
        returnBridge(retVal, data)
    },

    async entityCreateEmbeddedEntityHandler(data){
        if(!api.isMainGM()) return;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await entity.createEmbeddedEntity(data.content.embedType, data.content.embedData, data.content.options)
        returnBridge(retVal, data)
    },

    async entityDeleteEmbeddedEntityHandler(data){
        if(!api.isMainGM()) return;
        const entity = await api.entityFromUuid(data.content.uuid);
        const retVal = {}
        retVal.result = await entity.deleteEmbeddedEntity(data.content.embedType, data.content.embedData, data.content.options)
        returnBridge(retVal, data)
    }
}