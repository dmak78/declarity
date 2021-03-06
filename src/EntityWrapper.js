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
  equals,
} from 'ramda';

import {
  rejectNil,
  contentByKey,
  onlyObjects,
  isArray,
} from './helpers/functional';

import {
  callMethodInSystems,
  generateChildEntities,
  getRenderContent,
  mountChildren,
  updateChildren,
  removeChildren,
} from './helpers/entityInstance';

class EntityWrapper {
  constructor(entityClass: Object) {
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
      getParams: this.getEntityParams,
    };

    // willMount
    if (has('willMount', this.entity)) {
      this._callingWillMount = true;

      this.entity.willMount(passedParams);

      if (has('systems', passedParams.props)) {
        callMethodInSystems('willMount', passedParams);
      }

      this._callingWillMount = false;
    }

    // create
    if (has('create', this.entity)) {
      this._callingCreate = true;
      const initState = this.entity.create(passedParams);

      if (has('systems', this.props)) {
        const systemParams = { ...passedParams, state: initState };

        const systemsState = callMethodInSystems('create', systemParams);

        this._callingCreate = false;
        this.setState(systemsState.state);
      } else {
        this._callingCreate = false;
        this.setState(initState);
      }
    }

    // didCreate
    if (has('didCreate', this.entity)) {
      this._callingDidCreate = true;

      const didCreateState = this.entity.didCreate(this.getEntityParams());

      this._callingDidCreate = false;

      if (didCreateState && typeof didCreateState === 'object') {
        this.setState(didCreateState);
      }
      if (has('systems', this.props)) {
        const didCreateSystemState = callMethodInSystems('didCreate', {
          ...this.getEntityParams(),
        });

        if (didCreateSystemState && typeof didCreateSystemState === 'object') {
          this.setState(didCreateSystemState.state);
        }
      }
    }

    this.shouldUpdate = true;

    // mount the children
    if (has('render', this.entity)) {
      //TODO: will need to add checks for other values besides <Entity> and null in render array.
      let childContext = this.context;

      this._callingRender = true;
      let renderContent = getRenderContent(this.entity, this.getEntityParams());
      this._callingRender = false;

      if (renderContent && renderContent.length && renderContent.length > 0) {
        if (has('getChildContext', this.entity)) {
          const childContextVal = this.entity.getChildContext(
            this.getEntityParams()
          );

          if (!isNil(childContextVal)) {
            childContext = {
              ...childContext,
              ...childContextVal,
            };
          }
        }

        renderContent = renderContent.map(content => {
          content.context = childContext;
          return content;
        });

        this.childEntities = mountChildren(renderContent);
      } else {
        this.childEntities = [];
      }
    } else {
      this.childEntities = [];
    }

    // didMount
    if (has('didMount', this.entity)) {
      this.entity.didMount(this.getEntityParams());
      //TODO: should this method adjust state?
      if (has('systems', this.props)) {
        callMethodInSystems('didMount', { ...this.getEntityParams() });
      }
    }
  };

  update = () => {
    // shouldUpdate
    if (has('shouldUpdate', this.entity)) {
      const shouldUpdateResult = this.entity.shouldUpdate(
        this.getEntityParams()
      );

      if (typeof shouldUpdateResult === 'boolean') {
        if (!shouldUpdateResult) {
          return;
        }
      }
    }

    this.shouldUpdate = false;

    // willUpdate
    if (has('willUpdate', this.entity)) {
      this._callingWillUpdate = true;
      this.entity.willUpdate(this.getEntityParams());
      //TODO: should this method adjust state?
      if (has('systems', this.props)) {
        callMethodInSystems('willUpdate', { ...this.getEntityParams() });
      }
      this._callingWillUpdate = false;
    }

    // update
    if (has('update', this.entity)) {
      this._callingUpdate = true;
      const entityParams = this.getEntityParams();

      let updatedState = this.entity.update({ ...this.getEntityParams() });

      if (has('systems', entityParams.props)) {
        const systemsParams = updatedState
          ? {
              ...entityParams,
              state: { ...entityParams.state, ...updatedState },
            }
          : this.getEntityParams();
        const newSystemsParams = callMethodInSystems('update', systemsParams);

        updatedState = { ...updatedState, ...newSystemsParams.state };
      }

      this._callingUpdate = false;

      if (!isNil(updatedState)) {
        this.setState(updatedState);
      }
    }

    const newRenderContent = getRenderContent(
      this.entity,
      this.getEntityParams()
    );

    if (this.childEntities || newRenderContent) {
      // get new rendered children.

      let childContext = this.context;

      if (has('getChildContext', this.entity)) {
        const childContextVal = this.entity.getChildContext(
          this.getEntityParams()
        );
        if (!isNil(childContextVal)) {
          childContext = { ...childContext, ...childContextVal };
        }
      }

      this._callingRender = true;
      const newContent = newRenderContent.map(content => {
        content.context = childContext;
        return content;
      });

      this._callingRender = false;

      this.childEntities = generateChildEntities(
        this.childEntities,
        newContent
      );
    }

    // didUpdate
    if (has('didUpdate', this.entity)) {
      this._callingDidUpdate = true;

      const didUpdateState = this.entity.didUpdate(this.getEntityParams());

      this._callingDidUpdate = false;

      if (didUpdateState && typeof didUpdateState === 'object') {
        this.setState(didUpdateState);
      }

      if (has('systems', this.props)) {
        const didUpdateSystemState = callMethodInSystems('didUpdate', {
          ...this.getEntityParams(),
        });

        if (didUpdateSystemState && typeof didUpdateSystemState === 'object') {
          this.setState(didUpdateSystemState.state);
        }
      }
    }

    this.shouldUpdate = true;
  };

  setState = (newState: any) => {
    this.previousState = this.state;

    this.state = {
      ...this.state,
      ...newState,
    };

    /* istanbul ignore if */
    if (this.shouldUpdate) {
      this.previousProps = this.props;
      this.previousChildren = this.children;
      this.update();
    }
  };

  remove = () => {
    if (has('willUnmount', this.entity)) {
      this._callingWillUnmount = true;

      const willUnmountState = this.entity.willUnmount(this.getEntityParams());

      this._callingWillUnmount = false;

      if (willUnmountState && typeof willUnmountState === 'object') {
        this.setState(willUnmountState);
      }

      if (has('systems', this.props)) {
        const willUnmountSystemState = callMethodInSystems('willUnmount', {
          ...this.getEntityParams(),
        });

        if (
          willUnmountSystemState &&
          typeof willUnmountSystemState === 'object'
        ) {
          this.setState(willUnmountSystemState.state);
        }
      }
    }

    if (has('render', this.entity)) {
      removeChildren(this.childEntities);
    }

    if (has('didUnmount', this.entity)) {
      this.entity.didUnmount(this.getEntityParams());

      if (has('systems', this.props)) {
        callMethodInSystems('didUnmount', { ...this.getEntityParams() });
      }
    }
  };

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
      getParams: this.getEntityParams,
    };

    return entityParams;
  };

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
    /* istanbul ignore if */
    if (
      global &&
      global.hasOwnProperty('__DECLARITY_HOT_LOADER__') &&
      this.entityClass.__declarity_location
    ) {
      const HotEntityClass =
        global.__DECLARITY_HOT_LOADER__[this.entityClass.__declarity_location]
          .default;

      if (HotEntityClass.__declarity_id !== this._hotClassID) {
        this._hotClassID = HotEntityClass.__declarity_id;
        this._entity = new HotEntityClass();
      }
    }
    // NOT hot loading.
    if (!this._entity) {
      this._entity = new this.entityClass();
    }

    return this._entity;
  }

  updateProps = newProps => {
    this.previousProps = this.props;
    this.props = newProps;
  };

  updateChildren = newChildren => {
    this.previousChildren = this.children;
    this.children = newChildren;
  };

  updateContext = newContext => {
    this.previousContext = this.context;
    this.context = newContext;
  };

  updateParams = (newProps, newChildren, newContext) => {
    this.updateProps(newProps);
    this.updateChildren(newChildren);
    this.updateContext(newContext);
  };
}

export default EntityWrapper;
