// TODO: what to do about doc store? Is it even needed as all data is stored locally via form. Maybe
// the store provides a good abstraction though the DB. If so then probably want to refactor to have
// something like field.bind(store)

import Field from './field';
// import DocStore from '../doc-store';
import globals from '../globals';
import Mapa from '../mapa';
import uuid from 'uuid';

export default class FormsField extends Field {
  // // TODO: how does this get cleaned up?
  // _bubbleUpChanges() {
  //   this._docs.on('change', change => {
  //     this._emitChange('change', change);
  //   });
  // }

  // TODO: pagination
  async _getAll(props) {
    const store = this.get('store');
    if (store) {
      const form = this.get('form');

      const records = await store.getAll(props);

      records.data.records.edges.forEach(edge => {
        const values = { id: edge.node.id };

        form.eachField(field => {
          // Field exists in returned records?
          const val = edge.node.fieldValues[field.get('name')];
          if (val) {
            values[field.get('name')] = val;
          }
        });

        this.addForm(values);
      });
    }
  }

  _listenForLoad() {
    this.on('load', async () => {
      const form = this.get('form');
      if (form) {
        form.emitLoad();
      }

      await this._getAll();
    });
  }

  _listenForShowArchived() {
    this.on('showArchived', async showArchived => {
      // Clear any existing forms
      this._forms.clear();

      await this._getAll({ showArchived });
    });
  }

  _create(props) {
    // We use a Mapa instead of an array as it allows us to index the forms by id. We use a Mapa
    // instead of a Map as we may want to iterate through the forms beginning at any single form.
    this._forms = new Mapa();

    super._create(props);

    this._listenForLoad();
    this._listenForShowArchived();
  }

  // constructor(props) {
  //   super(props);
  //
  //   // // TODO: should _docs be a reference that is passed in so that the store can be swapped out?
  //   // this._docs = new DocStore();
  //
  //   // this._bubbleUpChanges();
  // }

  _listenForChanges(form) {
    form.on('value', () => {
      // TODO: does it cause problems that we are just emitting the even and not a value? If we can
      // get away with this then our logic can remain simple and performant for when there is a lot
      // of data. If not, we'll need to do something like add the concept of getIndex() to Mapa so
      // that we can do directly replace the array item in this field's value. Another option is
      // track the reference to the value in the values array here and set it here.
      this._emitChange('value');
    });
  }

  _listenToForm(form) {
    const props = ['dirty', 'touched'];
    props.forEach(prop => {
      form.on(prop, value => {
        if (value === true) {
          // We only set the parent value when it is true as want to avoid infinite recursion
          this.set({ [prop]: value });
        }
      });
    });
  }

  addForm(values) {
    const clonedForm = this.get('form').clone();
    clonedForm.setValues(values);

    const id = clonedForm.getField('id');
    let key = 0;
    if (id.isBlank()) {
      // The id value is blank so use the current _forms length as the key
      key = this._forms.length();
    } else {
      key = id.getValue();
    }

    this._forms.set(key, clonedForm);

    this._listenToForm(clonedForm);

    // Emit change so that UI is notified
    this._emitChange('change', values);
  }

  _clearAllFormListeners() {
    this.eachForm(form => form.removeAllListeners());
  }

  _validateValueType(value) {
    let hasError = false;

    if (value === null) {
      // No error
    } else if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] !== 'object') {
        hasError = true;
      } else {
        // No error
      }
    } else {
      hasError = true;
    }

    this._hasTypeError = hasError;
  }

  _setValue(value) {
    this._validateValueType(value);
    if (!this._hasTypeError) {
      // TODO: what's the best way to set? e.g. if we set the same values over and over then we end
      // up recreating the forms each time. Would it be better to just use index to set and if there
      // are indexes that are in the current forms, but not in values then just delete?
      this._clearAllFormListeners(); // prevent listener leaks
      this._forms.clear();
      if (value && value.length > 0) {
        value.forEach(values => this.addForm(values));
      }
    }
  }

  removeForm(id) {
    const form = this._forms.get(id);
    form.removeAllListeners();
    this._forms.delete(id);
  }

  getForm(id) {
    return this._forms.get(id);
  }

  eachForm(onForm) {
    this._forms.each((form, id, last) => onForm(form, id, last));
  }

  _setForAllForms(props) {
    this.eachForm(form => form.set(props));
  }

  _setOnAllForms(props, propNames, expValue) {
    propNames.forEach(name => {
      if (
        props[name] !== undefined &&
        (expValue === undefined || props[name] === expValue)
      ) {
        this._setForAllForms({ [name]: props[name] });
      }
    });
  }

  set(props) {
    super.set(props);

    if (props.value !== undefined) {
      this._setValue(props.value);
    }

    // Set properties on all forms
    this._setOnAllForms(props, ['disabled', 'editable', 'pristine']);

    // Only set properties of forms if property is false
    this._setOnAllForms(props, ['dirty', 'touched'], false);

    // Only set properties of forms if property is null
    this._setOnAllForms(props, ['err'], null);

    this._setIfUndefined(
      props,
      'form',
      'forbidCreate',
      'forbidUpdate',
      'forbidDelete',
      'minSize',
      'maxSize',
      'singularLabel',
      'store'
    );
  }

  _getValue() {
    return this._forms.map(form => {
      return form.getValues();
    });
  }

  getOne(name) {
    if (name === 'value') {
      return this._getValue();
    }

    const value = this._getIfAllowed(
      name,
      'form',
      'forbidCreate',
      'forbidUpdate',
      'forbidDelete',
      'minSize',
      'maxSize',
      'singularLabel',
      'store'
    );
    return value === undefined ? super.getOne(name) : value;
  }

  // getStore() {
  //   return this._docs;
  // }

  *getForms() {
    yield* this._forms.values();
  }

  async save(form) {
    // await this._docs.set(form.getValues());
    const id = form.getField('id');
    const store = this.get('store');
    if (store) {
      // New?
      if (id.isBlank()) {
        const response = await store.create({ form });
        id.setValue(response.data.createRecord.id);
      } else {
        // Existing
        await store.update({ form, id: id.getValue() });
      }
    } else if (id.isBlank()) {
      // TODO: use the id from this._docs.set instead of this dummy id
      id.setValue(uuid.v4());
    }

    if (this._forms.has(id.getValue())) {
      const fieldForm = this._forms.get(id.getValue());
      fieldForm.setValues(form.getValues());
    } else {
      this.addForm(form.getValues());
    }

    globals.displaySnackbar(this.getSingularLabel() + ' saved');
  }

  async delete(form) {
    // await this._docs.delete(form.getField('id').getValue());

    const store = this.get('store');
    if (store) {
      await store.archive({ form, id: form.getValue('id') });
    }

    this.removeForm(form.getField('id').getValue());
    globals.displaySnackbar(this.getSingularLabel() + ' deleted');
  }

  reachedMax() {
    const maxSize = this.get('maxSize');
    return maxSize !== null && this._forms.length() >= maxSize;
  }

  validate() {
    super.validate();

    let errors = [];
    for (const form of this._forms.values()) {
      form.validate();
      if (form.hasErr()) {
        errors.push({
          id: form.getField('id').getValue(),
          error: form.getErrs()
        });
      }
    }

    const numForms = this._forms.length();

    const minSize = this.get('minSize');
    const maxSize = this.get('maxSize');

    if (minSize !== null && numForms < minSize) {
      errors.push({
        error: `${minSize} or more`
      });
    } else if (maxSize !== null && numForms > maxSize) {
      errors.push({
        error: `${maxSize} or less`
      });
    }

    if (this._hasTypeError) {
      errors.push({ error: 'must be an array of objects' });
    }

    if (errors.length > 0) {
      this.setErr(errors);
    }
  }

  getSingularLabel() {
    if (this.get('singularLabel')) {
      return this.get('singularLabel');
    } else {
      // Automatically calculate singular label by removing last 's'
      const label = this.get('label');
      return label.substr(0, label.length - 1);
    }
  }

  isBlank() {
    let isBlank = true;
    for (const form of this.getForms()) {
      if (!form.isBlank()) {
        isBlank = false;
        break;
      }
    }
    return isBlank;
  }
}
