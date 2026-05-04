(function () {
  'use strict';

  function createInitialState() {
    return { profs: [], patients: [], sessoes: [], tab: 'dash', session: null };
  }

  function resetCollections(state) {
    state.profs = [];
    state.patients = [];
    state.sessoes = [];
    return state;
  }

  window.FisioStore = {
    createInitialState: createInitialState,
    resetCollections: resetCollections
  };
})();
