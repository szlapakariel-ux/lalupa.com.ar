/** Estado estándar de formularios con useActionState. */
export interface ActionState {
  error?: string;
  success?: string;
}

export const IDLE: ActionState = {};
