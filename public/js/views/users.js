import { api } from '../api-client.js';
import { button, el, field, input, select } from '../dom.js';
import { formatDate } from '../format.js';
import { roleLabel } from '../routes-map.js';
import { SPECIALTIES, specialtyLabel } from '../state-map.js';

const ROLE_OPTIONS = [
  ['ADMIN', 'Administración'],
  ['PROFESIONAL', 'Profesional'],
];

export async function renderUsers(container, ctx) {
  let users = [];
  let professionals = [];
  let resetTarget = null;

  const status = el('p', { class: 'notice', hidden: true });
  const list = el('ul', { class: 'history' });

  const nombre = input('nombre', { autocomplete: 'name', required: true });
  const email = input('email', { type: 'email', autocomplete: 'off', required: true });
  const password = input('password', {
    type: 'password',
    autocomplete: 'new-password',
    required: true,
    minlength: 10,
  });
  const rol = select('rol', ROLE_OPTIONS, 'PROFESIONAL');
  const specialty = select(
    'specialty',
    SPECIALTIES.map((code) => [code, specialtyLabel(code)]),
    'BIOQUIMICA',
  );
  const mode = select(
    'mode',
    [
      ['new', 'Crear un profesional nuevo'],
      ['link', 'Vincular uno existente'],
    ],
    'new',
  );
  const professional = el('select', { name: 'professionalId' });

  const modeField = field('Alta del profesional', mode);
  const specialtyField = field('Especialidad', specialty);
  const professionalField = field('Profesional sin cuenta', professional);

  const submit = el('button', { type: 'submit', class: 'primary', text: 'Crear usuario' });

  const form = el('form', { class: 'panel' }, [
    el('h2', { text: 'Nuevo usuario' }),
    el('p', {
      class: 'hint',
      text: 'Creá cuentas de administración o de profesional. Los postulantes se registran solos.',
    }),
    el('div', { class: 'grid two' }, [
      field('Nombre', nombre),
      field('Email', email),
      field('Contraseña inicial', password),
      field('Rol', rol),
    ]),
    el('div', { class: 'grid two' }, [modeField, specialtyField, professionalField]),
    el('div', { class: 'row', style: 'margin-top:12px' }, [submit]),
    status,
  ]);

  function setStatus(text, kind = 'info') {
    status.textContent = text;
    status.className = `notice ${kind}`;
    status.hidden = false;
  }

  function syncForm() {
    const isProfessional = rol.value === 'PROFESIONAL';

    modeField.hidden = !isProfessional;
    specialtyField.hidden = !isProfessional || mode.value !== 'new';
    professionalField.hidden = !isProfessional || mode.value !== 'link';
  }

  function loadProfessionalOptions() {
    const available = professionals.filter((item) => !item.accountLinked);

    professional.replaceChildren(
      ...(available.length === 0
        ? [el('option', { value: '', text: 'No hay profesionales sin cuenta' })]
        : available.map((item) =>
            el('option', {
              value: item.id,
              text: `${item.name} · ${specialtyLabel(item.specialty)}`,
            }),
          )),
    );
  }

  function resetForm(user) {
    const nextPassword = input('password', {
      type: 'password',
      autocomplete: 'new-password',
      minlength: 10,
    });

    return el('div', { class: 'notice' }, [
      el('p', {
        text: `Nueva contraseña para ${user.nombre}. Se cierran sus sesiones abiertas.`,
        style: 'margin:0 0 8px',
      }),
      nextPassword,
      el('div', { class: 'row', style: 'margin-top:8px' }, [
        button(
          'Guardar contraseña',
          async () => {
            try {
              await api.resetUserPassword(user.id, nextPassword.value);
              resetTarget = null;
              await load();
              setStatus('Contraseña actualizada.', 'ok');
            } catch (error) {
              setStatus(error.message, 'error');
            }
          },
          { class: 'primary' },
        ),
        button('Cancelar', () => {
          resetTarget = null;
          paint();
        }),
      ]),
    ]);
  }

  function actionsFor(user) {
    const actions = el('div', { class: 'row' });

    if (user.activo && user.id !== ctx.user.id) {
      actions.append(
        button(
          'Desactivar',
          async () => {
            try {
              await api.deactivateUser(user.id);
              await load();
              setStatus('Usuario desactivado.', 'ok');
            } catch (error) {
              setStatus(error.message, 'error');
            }
          },
          { class: 'danger' },
        ),
      );
    }

    if (!user.activo) {
      actions.append(
        button('Activar', async () => {
          try {
            await api.activateUser(user.id);
            await load();
            setStatus('Usuario activado.', 'ok');
          } catch (error) {
            setStatus(error.message, 'error');
          }
        }),
      );
    }

    actions.append(
      button('Reset contraseña', () => {
        resetTarget = user.id;
        paint();
      }),
    );

    return actions;
  }

  function userItem(user) {
    const nodes = [
      el('div', { class: 'line' }, [
        el('div', {}, [
          el('div', { class: 'name', text: user.nombre }),
          el('div', {
            class: 'meta',
            text: [
              user.email,
              user.specialty ? specialtyLabel(user.specialty) : null,
              `Alta ${formatDate(user.createdAt)}`,
            ]
              .filter(Boolean)
              .join(' · '),
          }),
        ]),
        el('div', { class: 'row' }, [
          el('span', { class: 'badge', text: roleLabel(user.rol) }),
          el('span', {
            class: user.activo ? 'badge ok' : 'badge bad',
            text: user.activo ? 'Activo' : 'Inactivo',
          }),
        ]),
      ]),
      actionsFor(user),
    ];

    if (resetTarget === user.id) {
      nodes.push(resetForm(user));
    }

    return el('li', {}, nodes);
  }

  function paint() {
    list.replaceChildren();

    if (users.length === 0) {
      list.append(el('li', { class: 'empty', text: 'No hay usuarios.' }));
      return;
    }

    for (const user of users) {
      list.append(userItem(user));
    }
  }

  async function load() {
    try {
      [users, professionals] = await Promise.all([api.users(), api.professionals()]);
      loadProfessionalOptions();
      paint();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  rol.addEventListener('change', syncForm);
  mode.addEventListener('change', syncForm);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    setStatus('Creando usuario…', 'info');

    try {
      const payload = {
        nombre: nombre.value.trim(),
        email: email.value.trim(),
        password: password.value,
        rol: rol.value,
      };

      if (rol.value === 'PROFESIONAL') {
        if (mode.value === 'link') {
          if (!professional.value) {
            throw new Error('Elegí un profesional sin cuenta.');
          }
          payload.professionalId = professional.value;
        } else {
          payload.specialty = specialty.value;
        }
      }

      await api.createUser(payload);
      form.reset();
      rol.value = 'PROFESIONAL';
      mode.value = 'new';
      syncForm();
      await load();
      setStatus('Usuario creado.', 'ok');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  container.append(
    form,
    el('section', { class: 'panel' }, [
      el('div', { class: 'card-head' }, [el('h2', { text: 'Usuarios' })]),
      el('p', {
        class: 'hint',
        text: 'La baja es lógica: corta las sesiones abiertas y conserva el historial clínico.',
      }),
      el('div', { class: 'list-panel' }, [list]),
    ]),
  );

  syncForm();
  await load();
}
