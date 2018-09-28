import React from 'react';
import Field from './field';
import attach from '../attach';
import HelpToolTip from './help-tool-tip';
import FlexBreak from '../flex-break';

class CompositeField extends React.PureComponent {
  render() {
    const { component, help, editable, useDisplayValue } = this.props;

    let fields = [];

    let lastIsBlock = false;

    component.eachField((field, index, last) => {
      // Don't show the field if we are using the display value and it is blank, e.g. it is the
      // empty "next" field.
      if (!useDisplayValue || !field.isBlank()) {
        if (last && field.get('block')) {
          lastIsBlock = true;
        }
        fields.push(<Field component={field} key={index} noBlock={last} />);
      }
    });

    if (help && editable) {
      fields.push(<HelpToolTip help={help} key="help" />);
    }

    if (lastIsBlock) {
      // Break after any help
      fields.push(<FlexBreak key="break" />);
    }

    return fields;
  }
}

// We want the component to update when we receive new fields
export default attach(['change', 'help', 'editable', 'useDisplayValue'])(
  CompositeField
);
