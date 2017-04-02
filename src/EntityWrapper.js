/* global __DECLARITY_HOT_LOADER__ */
import {
    map,
    reduce,
    filter,
    zip,
    pipe,
    isNil,
    assoc,
    has,
    is,
    mapObjIndexed,
    flatten,
    equals
} from 'ramda';

import {
    rejectNil,
    contentByKey,
    onlyObjects,
    isArray
} from './helpers/functional';

import {
    callMethodInSystems,
    generateChildEntities,
    getRenderContent,
    mountChildren,
    updateChildren,
    removeChildren
} from './helpers/entityInstance'

class EntityWrapper {
    constructor(entityClass) {
        this.entityClass = entityClass;
    }

    mount = (props, children, context = {}) => {
        this.props = props;
        this.children = children;
        this.context = context;
        this.shouldUpdate = false;

        const passedParams = {
            props,
            children,
            context,
            setState: this.setState,
            getParams: this.getEntityParams
        }

        // willMount
        if (this.entity.hasOwnProperty('willMount')) {
            this._callingWillMount = true;
            this.entity.willMount(passedParams);
            this._callingWillMount = false;
        }

        // create
        if (this.entity.hasOwnProperty('create')) {
            this._callingCreate = true;
            const initState = this.entity.create(passedParams);

            if (has('systems', this.props)) {
                const systemParams = {...passedParams, state: initState};

                const systemsState = callMethodInSystems('create', systemParams);

                this._callingCreate = false;
                this.setState(systemsState.state);
            }

            else {
                this._callingCreate = false;
                this.setState(initState);
            }
        }

        this.shouldUpdate = true;

        // didCreate
        if (this.entity.hasOwnProperty('didCreate')) {
            this.entity.didCreate(this.getEntityParams());
            // handle async stuff here.
        }

        // mount the children
        if (this.entity.hasOwnProperty('render')) {
            //TODO: will need to add checks for other values besides <Entity> and null in render array.
            let childContext = this.context;

            this._callingRender = true;
            let renderContent = getRenderContent(this.entity, this.getEntityParams());
            this._callingRender = false;

            if (renderContent && renderContent.length && renderContent.length > 0) {
                if (has('getChildContext', this.entity)) {
                    const childContextVal = this.entity.getChildContext(this.getEntityParams())

                    if (!isNil(childContextVal)) {
                        childContext = {
                            ...childContext,
                            ...childContextVal
                        }
                    }

                }

                renderContent = renderContent.map(content => {
                    content.context = childContext
                    return content;
                })

                this.childEntities = mountChildren(renderContent)
            }

            else {
                this.childEntities = []
            }

        }

        else {
            this.childEntities = []
        }

        // didMount
        if (this.entity.hasOwnProperty('didMount')) {
            this.entity.didMount(this.getEntityParams());
        }
    }

    update = () => {
        // shouldUpdate
        if (this.entity.hasOwnProperty('shouldUpdate')) {
            const shouldUpdateResult = this.entity.shouldUpdate()

            if (typeof shouldUpdateResult === "boolean") {
                if (!shouldUpdateResult) {
                    return;
                }
            }
        }

        this.shouldUpdate = false;

        // willUpdate
        if (this.entity.hasOwnProperty('willUpdate')) {
            this._callingWillUpdate = true;
            this.entity.willUpdate(this.getEntityParams());
            this._callingWillUpdate = false;
        }

        // update
        if (this.entity.hasOwnProperty('update')) {
            this._callingUpdate = true;
            const entityParams = this.getEntityParams();

            let updatedState = this.entity.update({...this.getEntityParams()});

            if (has('systems', entityParams.props)) {
                const systemsParams = updatedState
                                          ? {...this.getEntityParams(), state: updatedState}
                                          : this.getEntityParams()

                const newSystemsParams = callMethodInSystems('update', systemsParams)

                updatedState = {...updatedState, ...newSystemsParams.state}
            }

            this._callingUpdate = false;

            if (!isNil(updatedState)) {
                this.setState(updatedState)
            }
        }

        // didUpdate

        if (this.entity.hasOwnProperty('didUpdate')) {
            this._callingDidUpdate = true;
            this.entity.didUpdate(this.getEntityParams());
            this._callingDidUpdate = false;
        }

        const newRenderContent = getRenderContent(this.entity, this.getEntityParams())

        if (this.childEntities || newRenderContent) {
            // get new rendered children.

            let childContext = this.context;

            if (this.entity.hasOwnProperty('getChildContext')) {
                const childContextVal = this.entity.getChildContext(this.getEntityParams())
                if (!isNil(childContextVal)) {
                    childContext = {...childContext, ...childContextVal}
                }
            }

            this._callingRender = true;
            const newContent = newRenderContent.map((content) => {
                content.context = childContext;
                return content;
            });

            this._callingRender = false;

            // If entityClassNames are same, then we can assume that this level didn't change.
            // Can add extra checks for props later, or put those in the component.
            const oldComponentNames = this.childEntities.map(child => child.entityClass.name);
            const newComponentNames = newContent.map(child => child.entityClassName);

            if (equals(oldComponentNames, newComponentNames)) {
                // No add/remove of components is needed.
                // Just update Props.

                this.childEntities = updateChildren(zip(this.childEntities, newContent))
            }

            else {
                this.childEntities = generateChildEntities(this.childEntities, newContent);
            }
        }

        this.shouldUpdate = true;
    }

    setState = (newState: any) => {
        // if (this._callingWillMount) {
        //     console.log('trying to call setState in willMount. This is a noop', this.entity);
        //     return;
        // }
        //
        // if (this._callingCreate) {
        //     console.log('trying to call setState in create(). This is a noop', this.entity);
        //     return;
        // }
        //
        // if (this._callingUpdate) {
        //     console.log('trying to call setState in update(). This is a noop. please have the update() method return any updated state.', this.entity);
        //     return;
        // }

        this.previousState = this.state;

        this.state = {
            ...this.state,
            ...newState
        }

        if (this.shouldUpdate) {
            // Note: Don't know if setting previous stuff here is proper.
            this.previousProps = this.props;
            this.previousChildren = this.children;
            this.update();
        }
    }

    remove = () => {
        // Figure out if anything needs to happen here.

        if (this.entity.hasOwnProperty('willUnmount')) {
            this.entity.willUnmount(this.getEntityParams());
        }

        if (this.entity.hasOwnProperty('render')) {
            removeChildren(this.childEntities)
        }

        if (this.entity.hasOwnProperty('didUnmount')) {
            this.entity.didUnmount(this.getEntityParams())
        }
    }

    getEntityParams = () => {
        let entityParams = {
            previousProps: this.previousProps,
            previousChildren: this.previousChildren,
            previousState: this.previousState,
            previousContext: this.previousContext,
            props: this.props,
            children: this.children,
            context: this.context,
            state: this.state,
            setState: this.setState,
            getParams: this.getEntityParams
        }

        return entityParams;
    }

    get props(): Object {
        return this._props;
    }

    set props(props: Object) {
        this._props = isNil(props) ? {} : props;
    }

    get children(): Array {
        return this._children;
    }

    set children(children: ?Array): void {
        this._children = isArray(children) ? flatten(children) : [];
    }

    get entity() {
        if (
            global &&
            global.hasOwnProperty('__DECLARITY_HOT_LOADER__') &&
            this.entityClass.__declarity_location
        ) {
            const hotClass = global.__DECLARITY_HOT_LOADER__[this.entityClass.__declarity_location].default

            if (hotClass.__declarity_id !== this._hotClassID) {
                this._hotClassID = hotClass.__declarity_id
                this._entity = new hotClass()
            }

        }
        // NOT hot loading.
        if (!this._entity) {
            this._entity = new this.entityClass()
        }
        return this._entity
    }

    updateProps = (newProps) => {
        this.previousProps = this.props;
        this.props = newProps;
    }

    updateChildren = (newChildren) => {
        this.previousChildren = this.children;
        this.children = newChildren;
    }

    updateContext = (newContext) => {
        this.previousContext = this.context;
        this.context = newContext;
    }

    updateParams = (newProps, newChildren, newContext) => {
        this.updateProps(newProps);
        this.updateChildren(newChildren);
        this.updateContext(newContext);
    }
}

export default EntityWrapper;
