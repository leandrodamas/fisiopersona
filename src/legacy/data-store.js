(function () {
  'use strict';

  function createDataHandlers(deps) {
    function sbReq(method, path, body, extraHeaders) {
      return deps.coreReq(method, path, deps.getSession(), body, extraHeaders);
    }

    function sbGet(t) { return sbReq('GET', t + '?order=created_at.asc'); }
    function sbIns(t, d) { return sbReq('POST', t, d); }
    function sbUpd(t, id, d) { return sbReq('PATCH', t + '?id=eq.' + id, d); }
    function sbDel(t, id) { return sbReq('DELETE', t + '?id=eq.' + id); }
    function sbUpsert(t, d, key) {
      return sbReq('POST', t + '?on_conflict=' + key, d, { Prefer: 'resolution=merge-duplicates,return=representation' });
    }

    function profCnsSupported() {
      var profs = deps.getState().profs || [];
      if (!profs.length) return true;
      return profs.some(function (p) {
        return Object.prototype.hasOwnProperty.call(p, 'cns');
      });
    }

    function isProfessorCnsSchemaError(err) {
      var msg = String((err && err.message) || err || '').toLowerCase();
      if (msg.indexOf('cns') < 0) return false;
      return (
        msg.indexOf('professores') >= 0 ||
        msg.indexOf('column') >= 0 ||
        msg.indexOf('schema') >= 0 ||
        msg.indexOf('pgrst') >= 0
      );
    }

    /** Mensagem HTTP do PostgREST vem inteira como err.message (JSON em string); parse obrigatório. */
    function parsePostgrestPayload(err) {
      var t = String((err && err.message) || '');
        try {
          var o = JSON.parse(t);
          return {
            raw: t,
            code: String(o.code || '').toUpperCase(),
            msg: String(o.message || ''),
            hint: String(o.hint || ''),
            detail:
              String(
                o.details != null && o.details !== ''
                  ? typeof o.details === 'object'
                    ? JSON.stringify(o.details)
                    : o.details
                  : o.detail != null && o.detail !== ''
                    ? o.detail
                    : ''
              )
          };
        } catch (e2) {
        return { raw: t, code: '', msg: t, hint: '', detail: '' };
      }
    }

    function shouldRetryProfessorArrayLikePgError(err) {
      var p = parsePostgrestPayload(err);
      var code = String(p.code || '').toUpperCase();
      var blob = ((p.msg || '') + ' ' + (p.hint || '') + ' ' + (p.detail || '') + ' ' + (p.raw || '')).toLowerCase();
      if (code === '22P02') return true;
      if (blob.indexOf('22p02') >= 0) return true;
      if (blob.indexOf('malformed array') >= 0) return true;
      if (blob.indexOf('invalid input syntax') >= 0) return true;
      if (blob.indexOf('cannot cast') >= 0) return true;
      if (blob.indexOf('unexpected end of input') >= 0) return true;
      if (blob.indexOf('invalid text representation') >= 0) return true;
      if (blob.indexOf('tipo') >= 0 && blob.indexOf('json') >= 0) return true;
      if (blob.indexOf('invalid input') >= 0 && (blob.indexOf('array') >= 0 || blob.indexOf('[]') >= 0)) {
        return true;
      }
      if (
        blob.indexOf('column') >= 0 &&
        (blob.indexOf('dias') >= 0 || blob.indexOf('estagiario') >= 0)
      ) {
        return blob.indexOf('does not exist') < 0;
      }
      return false;
    }

    function bodyHasProfessorArrayCols(b) {
      if (!b) return false;
      return Array.isArray(b.dias) || Array.isArray(b.estagiarios);
    }

    /** Repetir PATCH sem dias/estagiários se o Postgres recusar array (coluna não é text[]). */
    function shouldRetryProfessorPatchWithoutArrayColumns(body, err) {
      if (!body) return false;
      if (
        !Object.prototype.hasOwnProperty.call(body, 'dias') &&
        !Object.prototype.hasOwnProperty.call(body, 'estagiarios')
      ) {
        return false;
      }
      return shouldRetryProfessorArrayLikePgError(err);
    }

    /** Tenta PATCH sem instituição/curso quando o banco ainda não tem essas colunas (migration). */
    function shouldRetryProfessorPatchWithoutMetaColumns(body, err) {
      if (!body) return false;
      if (
        !Object.prototype.hasOwnProperty.call(body, 'instituicao_parceira') &&
        !Object.prototype.hasOwnProperty.call(body, 'curso_preceptoria')
      ) {
        return false;
      }
      var p = parsePostgrestPayload(err);
      var blob = ((p.msg || '') + ' ' + (p.hint || '') + ' ' + (p.detail || '') + ' ' + (p.raw || '')).toLowerCase();
      if (blob.indexOf('instituicao_parceira') >= 0) return true;
      if (blob.indexOf('curso_preceptoria') >= 0) return true;
      if (
        blob.indexOf("'cns' column") >= 0 ||
        blob.indexOf("the 'cns' column") >= 0 ||
        (blob.indexOf('could not find') >= 0 &&
          blob.indexOf('cns') >= 0 &&
          blob.indexOf('instituicao_parceira') < 0 &&
          blob.indexOf('curso_preceptoria') < 0)
      ) {
        return false;
      }
      var code = String(p.code || '').toUpperCase();
      if (code === 'PGRST204' || blob.indexOf('pgrst204') >= 0) {
        if (blob.indexOf('could not find') >= 0 && blob.indexOf('column') >= 0) {
          if (blob.indexOf('instituicao_parceira') >= 0 || blob.indexOf('curso_preceptoria') >= 0) {
            return true;
          }
        }
      }
      if (blob.indexOf('42703') >= 0 || blob.indexOf('undefined_column') >= 0) {
        if (blob.indexOf('instituicao_parceira') >= 0 || blob.indexOf('curso_preceptoria') >= 0) {
          return true;
        }
      }
      return false;
    }

    function professorSaveHumanError(pe) {
      var parts = [pe.msg || '', pe.detail || '', pe.hint || '', pe.code || '']
        .filter(function (x) {
          return x && typeof x === 'string' ? x.trim().length > 0 : !!x;
        })
        .map(function (x) {
          return typeof x === 'string' ? x.trim() : String(x);
        });
      var u = [];
      parts.forEach(function (p1) {
        if (u.indexOf(p1) < 0) u.push(p1);
      });
      return u.filter(Boolean).join(' — ');
    }

    function normalizeProfMetaFields(p) {
      if (!p || typeof p !== 'object') return p;
      var o = Object.assign({}, p);
      o.instituicao_parceira = o.instituicao_parceira == null ? '' : String(o.instituicao_parceira);
      o.curso_preceptoria = o.curso_preceptoria == null ? '' : String(o.curso_preceptoria);
      return o;
    }

    function professorPayloadNoCns(payload) {
      var clone = Object.assign({}, payload);
      delete clone.cns;
      return clone;
    }

    function looksLikeUuid(v) {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
    }

    function newProfessorUuid() {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      var rnd = function () {
        return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
      };
      return rnd() + rnd() + '-' + rnd() + '-4' + rnd().substring(0, 3) + '-a' + rnd().substring(0, 3) + '-' + rnd() + rnd() + rnd();
    }

    function firstSbRow(res) {
      if (Array.isArray(res) && res.length) return res[0];
      if (res && typeof res === 'object' && !Array.isArray(res) && res.id !== undefined) return res;
      return null;
    }

    function normNome(n) {
      if (deps.normName) return deps.normName(n);
      return String(n || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }

    function profWriteConflict(msg) {
      var m = String(msg || '').toLowerCase();
      return m.indexOf('23505') >= 0 || m.indexOf('duplicate') >= 0 || m.indexOf('409') >= 0 || m.indexOf('conflict') >= 0;
    }

    /** PostgREST + Postgres text[] exige JSON array; string "SEG|TER" gera 22P02 (malformed array literal). */
    function coalesceTextArrayField(v) {
      if (Array.isArray(v)) return v.map(function (x) { return String(x); }).filter(Boolean);
      if (v == null || v === '') return [];
      if (typeof v === 'string') return v.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      return [];
    }

    function profMetaExtraSupported() {
      return true;
    }

    function professorPayloadNoMetaExtras(payload) {
      var c = Object.assign({}, payload);
      delete c.instituicao_parceira;
      delete c.curso_preceptoria;
      return c;
    }

    function professorWriteBody(payload, includeCns, includeMetaExtras) {
      var o = {
        nome: payload.nome,
        cor: payload.cor,
        dias: coalesceTextArrayField(payload.dias),
        estagiarios: coalesceTextArrayField(payload.estagiarios)
      };
      if (includeCns) o.cns = payload.cns == null ? '' : String(payload.cns);
      if (includeMetaExtras) {
        o.instituicao_parceira =
          payload.instituicao_parceira == null ? '' : String(payload.instituicao_parceira);
        o.curso_preceptoria =
          payload.curso_preceptoria == null ? '' : String(payload.curso_preceptoria);
      }
      return o;
    }

    function mergeProfRow(body, row) {
      var m = row ? Object.assign({}, body, row) : Object.assign({}, body);
      return normalizeProfMetaFields(m);
    }

    function slugNome(n) {
      var base = normNome(n || '');
      return base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    function professorKey(p) {
      var s = slugNome(p.nome || '');
      if (s) return s;
      var nm = normNome(p.nome || '');
      if (nm) return 'n:' + nm;
      return 'id:' + String((p && p.id) || '');
    }

    /** Mantém um professor por slug do nome (UUID ou id mais referenciado por pacientes). */
    function dedupeProfessores(list, patientsOpt) {
      var patients = patientsOpt || [];
      function refs(pid) {
        if (!pid) return 0;
        return patients.filter(function (pt) {
          return pt.prof === pid;
        }).length;
      }
      var arr = list || [];
      var map = {};
      var keys = [];
      arr.forEach(function (p) {
        var k = professorKey(p);
        if (!map[k]) {
          map[k] = Object.assign({}, p);
          keys.push(k);
          return;
        }
        var a = map[k],
          b = p;
        var ra = refs(a.id),
          rb = refs(b.id);
        var idPick = rb > ra ? b.id : ra > rb ? a.id : looksLikeUuid(b.id) ? b.id : looksLikeUuid(a.id) ? a.id : b.id;
        map[k] = Object.assign({}, a, b, { id: idPick });
      });
      return keys.map(function (k) {
        return normalizeProfMetaFields(map[k]);
      });
    }

    function saveProfessorRecord(payload) {
      var st = deps.getState();
      var profs = st.profs || [];
      var useCns = profCnsSupported();
      var useMetaExtras = profMetaExtraSupported();
      var raw = useCns ? payload : professorPayloadNoCns(payload);
      raw = useMetaExtras ? raw : professorPayloadNoMetaExtras(raw);

      var existingById =
        raw.id && looksLikeUuid(raw.id) ? profs.find(function (p) { return p.id === raw.id; }) || null : null;
      var existing =
        existingById ||
        profs.find(function (p) {
          return normNome(p.nome) === normNome(raw.nome) || slugNome(p.nome) === slugNome(raw.nome);
        });

      function patchProf(uuid, body) {
        var mode =
          typeof body.__fisioProfPatchMode === 'string'
            ? body.__fisioProfPatchMode
            : 'json_arrays';
        var source = Object.assign({}, body);
        delete source.__fisioProfPatchMode;
        var sendBody = Object.assign({}, source);
        if (mode === 'pipe_text') {
          if (Array.isArray(sendBody.dias)) sendBody.dias = sendBody.dias.join('|');
          if (Array.isArray(sendBody.estagiarios)) sendBody.estagiarios = sendBody.estagiarios.join('|');
        } else if (mode === 'no_dias_est') {
          delete sendBody.dias;
          delete sendBody.estagiarios;
        }
        return sbUpd('professores', uuid, sendBody)
          .then(function (res) {
            return { res: res, body: sendBody };
          })
          .catch(function (err) {
            /** 1) Colunas dias/estagiários antigas esperam texto "SEG|TER" em vez de JSON array */
            if (
              mode === 'json_arrays' &&
              bodyHasProfessorArrayCols(sendBody) &&
              shouldRetryProfessorArrayLikePgError(err)
            ) {
              deps.toast('Adaptando dias e estagiários ao formato de texto do banco...', false);
              var bPipe = Object.assign({}, body, { __fisioProfPatchMode: 'pipe_text' });
              return patchProf(uuid, bPipe);
            }
            /** 2) Ainda incompatível: omite dias/estagiários (mantêm-se no servidor o que já estava, se PATCH parcial). */
            if (
              (mode === 'json_arrays' || mode === 'pipe_text') &&
              ((Object.prototype.hasOwnProperty.call(sendBody, 'dias') ||
                Object.prototype.hasOwnProperty.call(sendBody, 'estagiarios')) &&
                shouldRetryProfessorPatchWithoutArrayColumns(sendBody, err))
            ) {
              deps.toast(
                'Não foi possível gravar dias/estagiários neste esquema. Salvando dados principais. Use colunas text[] em professores ou ajuste o tipo das colunas no Supabase.',
                false
              );
              var bStrip = Object.assign({}, body, { __fisioProfPatchMode: 'no_dias_est' });
              return patchProf(uuid, bStrip);
            }
            if (shouldRetryProfessorPatchWithoutMetaColumns(sendBody, err)) {
              deps.toast(
                'Colunas parceira/curso ainda não existem no Supabase. Rode migracao_parceira_curso_professor.sql. Salvando o restante.',
                false
              );
              var bMeta = Object.assign({}, body);
              delete bMeta.instituicao_parceira;
              delete bMeta.curso_preceptoria;
              if (typeof body.__fisioProfPatchMode === 'string') {
                bMeta.__fisioProfPatchMode = body.__fisioProfPatchMode;
              }
              return patchProf(uuid, bMeta);
            }
            if (isProfessorCnsSchemaError(err)) {
              deps.toast(
                'Coluna CNS de professor ainda não existe no banco. Salvando sem CNS por enquanto.',
                false
              );
              var b2 = Object.assign({}, body);
              delete b2.cns;
              if (typeof body.__fisioProfPatchMode === 'string') {
                b2.__fisioProfPatchMode = body.__fisioProfPatchMode;
              }
              return patchProf(uuid, b2);
            }
            var pe = parsePostgrestPayload(err);
            throw new Error(professorSaveHumanError(pe) || pe.raw || 'Erro ao salvar professor.');
          });
      }

      /** Sem POST ?on_conflict=id (evita PGRST204 se id não estiver em índice único reconhecido). */
      function getThenPatchOrInsertProf(uuid, body) {
        return sbReq('GET', 'professores?id=eq.' + uuid).then(function (rows) {
          var list = Array.isArray(rows) ? rows : [];
          if (list.length) {
            return patchProf(uuid, body).then(function (pair) {
              return mergeProfRow(Object.assign({ id: uuid }, pair.body), firstSbRow(pair.res) || { id: uuid });
            });
          }
          return insertProf(Object.assign({ id: uuid }, body)).then(function (res) {
            var row = firstSbRow(res);
            if (!row || !row.id) throw new Error('Supabase não devolveu o professor criado (id ausente).');
            return mergeProfRow(Object.assign({ id: uuid }, body), row);
          });
        });
      }

      function upsertProfUuid(uuid, body) {
        return getThenPatchOrInsertProf(uuid, body).catch(function (err) {
          if (!isProfessorCnsSchemaError(err)) throw err;
          deps.toast('Coluna CNS de professor ainda não existe no banco. Salvando sem CNS por enquanto.', false);
          var b2 = Object.assign({}, body);
          delete b2.cns;
          return getThenPatchOrInsertProf(uuid, b2);
        });
      }

      function insertProf(body) {
        function doIns(b) {
          return sbIns('professores', b).catch(function (err) {
            if (shouldRetryProfessorPatchWithoutMetaColumns(b, err)) {
              deps.toast(
                'Colunas parceira/curso ainda não existem no Supabase. Rode migracao_parceira_curso_professor.sql. Salvando o restante.',
                false
              );
              var bMeta = Object.assign({}, b);
              delete bMeta.instituicao_parceira;
              delete bMeta.curso_preceptoria;
              return sbIns('professores', bMeta).catch(function (err3) {
                if (!isProfessorCnsSchemaError(err3)) throw err3;
                deps.toast('Coluna CNS de professor ainda não existe no banco. Salvando sem CNS por enquanto.', false);
                var b4 = Object.assign({}, bMeta);
                delete b4.cns;
                return sbIns('professores', b4);
              });
            }
            if (shouldRetryProfessorPatchWithoutArrayColumns(b, err)) {
              deps.toast(
                'Tipo das colunas dias/estagiários não aceita array. Inserindo sem dias/estagiários; use text[] no Postgres para gravar listas.',
                false
              );
              var bi = Object.assign({}, b);
              delete bi.dias;
              delete bi.estagiarios;
              return doIns(bi);
            }
            if (!isProfessorCnsSchemaError(err)) throw err;
            deps.toast('Coluna CNS de professor ainda não existe no banco. Salvando sem CNS por enquanto.', false);
            var b2 = Object.assign({}, b);
            delete b2.cns;
            return sbIns('professores', b2);
          });
        }
        return doIns(body).catch(function (err) {
          if (isProfessorCnsSchemaError(err)) throw err;
          var bare = Object.assign({}, body);
          delete bare.dias;
          delete bare.estagiarios;
          return doIns(bare).catch(function (err2) {
            if (isProfessorCnsSchemaError(err2)) throw err2;
            var min = {
              nome: String(bare.nome || body.nome || ''),
              cor: String(bare.cor || body.cor || '#0d9488'),
              id:
                bare.id && looksLikeUuid(bare.id)
                  ? bare.id
                  : body.id && looksLikeUuid(body.id)
                    ? body.id
                    : newProfessorUuid()
            };
            return doIns(min).catch(function () {
              throw err2;
            });
          });
        });
      }

      if (existing && looksLikeUuid(existing.id)) {
        var bPatch = professorWriteBody(raw, useCns, useMetaExtras);
        return patchProf(existing.id, bPatch).then(function (pair) {
          return mergeProfRow(Object.assign({ id: existing.id }, pair.body), firstSbRow(pair.res) || { id: existing.id });
        });
      }

      if (raw.id && looksLikeUuid(raw.id)) {
        var bUp = professorWriteBody(raw, useCns, useMetaExtras);
        return upsertProfUuid(raw.id, bUp);
      }

      var bIns = professorWriteBody(raw, useCns, useMetaExtras);
      var insertPayload = Object.assign({ id: newProfessorUuid() }, bIns);
      return sbGet('professores').then(function (rows) {
        var dup = (rows || []).find(function (p) {
          return normNome(p.nome) === normNome(raw.nome) || slugNome(p.nome) === slugNome(raw.nome);
        });
        if (dup && looksLikeUuid(dup.id)) {
          var bPatchDup = professorWriteBody(raw, useCns, useMetaExtras);
          return patchProf(dup.id, bPatchDup).then(function (pair) {
            return mergeProfRow(Object.assign({ id: dup.id }, pair.body), firstSbRow(pair.res) || dup);
          });
        }
        return insertProf(insertPayload)
          .then(function (res) {
            var row = firstSbRow(res);
            if (!row || !row.id) throw new Error('Supabase não devolveu o professor criado (id ausente).');
            return mergeProfRow(insertPayload, row);
          })
          .catch(function (err) {
            if (!profWriteConflict(err.message)) throw err;
            return sbGet('professores').then(function (rows2) {
              var found = (rows2 || []).find(function (p) {
                return normNome(p.nome) === normNome(raw.nome) || slugNome(p.nome) === slugNome(raw.nome);
              });
              if (!found || !looksLikeUuid(found.id)) throw err;
              var b2 = professorWriteBody(raw, useCns, useMetaExtras);
              return patchProf(found.id, b2).then(function (pair) {
                return mergeProfRow(Object.assign({ id: found.id }, pair.body), firstSbRow(pair.res) || found);
              });
            });
          });
      });
    }

    function loadAll() {
      if (!deps.hasSupabaseConfig()) {
        var msg =
          typeof deps.configMissingHelpHtml === 'function'
            ? deps.configMissingHelpHtml()
            : '\u274c Configura\u00e7\u00e3o n\u00e3o encontrada<br><br>' +
              '<span style="color:#64748b;font-size:12px">Crie/edite o arquivo <b>config.js</b> com as credenciais do Supabase.<br>Use <b>config.example.js</b> como modelo.</span>';
        deps.setLoading(true, msg);
        return;
      }

      var st = deps.getState();
      st.session = deps.getSessionFromStorage();
      if (!st.session || !st.session.access_token) {
        deps.setLoading(false);
        deps.showAuth();
        return;
      }

      if (deps.sessionExpired(st.session)) {
        deps.setLoading(true, 'Renovando sessão...');
        return deps.refreshSession().then(loadAll).catch(function () {
          deps.authLogout();
          deps.authMessage('Sessão expirada. Entre novamente.', false);
        });
      }

      deps.hideAuth();
      deps.setLoading(true, 'Conectando ao banco de dados...');
      return Promise.all([sbGet('professores'), sbGet('pacientes'), sbGet('sessoes')])
        .then(function (res) {
          var state = deps.getState();
          state.profs = dedupeProfessores(Array.isArray(res[0]) ? res[0] : [], Array.isArray(res[1]) ? res[1] : []);
          state.patients = res[1];
          state.sessoes = res[2];
          deps.setLoading(false);
          deps.renderHeader();
          deps.renderAlerts();
          deps.go(state.tab);
        })
        .catch(function (e) {
          deps.setLoading(
            true,
            '❌ Erro ao conectar ao Supabase<br><br>' +
              '<span style="color:#64748b;font-size:12px">Verifique se o SQL foi executado no Supabase.<br>Erro: ' +
              deps.esc(e.message) +
              '</span><br><br>' +
              '<button onclick="loadAll()" style="background:#0d9488;color:#ffffff;border:none;padding:10px 20px;border-radius:10px;font-weight:700;cursor:pointer;font-family:inherit">🔄 Tentar novamente</button>'
          );
        });
    }

    return {
      sbReq: sbReq,
      sbGet: sbGet,
      sbIns: sbIns,
      sbUpd: sbUpd,
      sbDel: sbDel,
      sbUpsert: sbUpsert,
      saveProfessorRecord: saveProfessorRecord,
      loadAll: loadAll
    };
  }

  window.createFisioDataHandlers = createDataHandlers;
})();
