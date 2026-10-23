export function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) {
      continue;
    }
    if (key === 'class') {
      node.className = value;
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  return node;
}

export function clear(node) {
  node.replaceChildren();
}

export function field(labelText, control) {
  const id = control.id || `field-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;

  return el('label', { class: 'field', for: id }, [el('span', { text: labelText }), control]);
}

export function input(name, attributes = {}) {
  return el('input', { name, ...attributes });
}

export function select(name, options, value = '') {
  const control = el('select', { name });

  for (const [optionValue, label] of options) {
    const option = el('option', { value: optionValue, text: label });
    if (optionValue === value) {
      option.selected = true;
    }
    control.append(option);
  }

  return control;
}

export function button(label, onClick, attributes = {}) {
  return el('button', { type: 'button', text: label, onClick, ...attributes });
}
