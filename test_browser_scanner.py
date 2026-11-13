from playwright.sync_api import sync_playwright
from urllib.parse import urlparse,parse_qs

BASE='http://127.0.0.1:8765'
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
    context=browser.new_context(permissions=['camera'],ignore_https_errors=True)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    saved=[]
    def handle_route(route):
        u=urlparse(route.request.url);p=u.path
        if p.endswith('/api/login'): data={'sucesso':True,'token':'fakesession','usuario':{'nome':'Conferente','perfil':'admin','loja':'151'}}
        elif p.endswith('/api/sessao'): data={'sucesso':True,'usuario':{'nome':'Conferente','perfil':'admin','loja':'151'}}
        elif p.endswith('/api/usuarios'): data={'usuarios':[{'nome':'Alice','perfil':'funcionario','ativo':True}]}
        elif p.endswith('/api/mapas') and route.request.method=='POST':
            saved.append(route.request.post_data_json);data={'status':'saved','id':'ok'}
        elif p.endswith('/api/mapas'): data={'registros':[]}
        elif p.endswith('/api/produtos'): data={'produtos':[{'ean':'07891234567895','codigo_interno':'123','descricao':'Item de teste','secao':'Alimentos'}]}
        elif p.endswith('/api/estoque'): data={'registros':[]}
        elif p.endswith('/api/vencidos'): data={'registros':[]}
        elif p.endswith('/api/sinalizacoes'): data={'registros':[]}
        elif p.endswith('/api/auditoria'): data={'registros':[]}
        else: data={'registros':[],'usuarios':[]}
        route.fulfill(status=200,content_type='application/json',body=__import__('json').dumps(data))
    page.route('**/api/**',handle_route)
    page.add_init_script('''
      window.BarcodeDetector = class {
         constructor(options) { this.formats=options.formats; }
         static async getSupportedFormats(){return ['ean_13','ean_8','upc_a'];}
         async detect(video){return [{rawValue:'07891234567895'}];}
      }
    ''')
    page.goto(BASE+'/index.html')
    page.locator('#login-nome').fill('Conferente')
    page.locator('#login-loja').fill('151')
    page.locator('#login-pin').fill('1234567890')
    page.locator('#btn-login').click()
    page.locator('#app-shell').wait_for(state='visible',timeout=10000)
    page.locator('#top-open-launch').click()
    page.locator('#form-launch').wait_for(timeout=10000)
    page.locator('#scan-ean').click()
    page.wait_for_function("document.querySelector('#form-launch [name=ean]').value==='07891234567895'",timeout=15000)
    print('SCAN EAN:',page.locator('#form-launch [name=ean]').input_value())
    print('PREVIEW:',page.locator('#product-preview').inner_text())
    print('SAVED WITHOUT FORM SUBMIT:',len(saved))
    assert len(saved)==0
    assert 'Item de teste' in page.locator('#product-preview').inner_text()
    assert not page.locator('#ean-scanner-dialog').evaluate('(el)=>el.open')
    # Loja continua bloqueada quando salva e há navegação para lançar pela barra lateral.
    assert page.locator('#side-open-launch').is_visible()
    page.locator('#launch-close').click()
    page.locator('#btn-logout').click()
    assert page.locator('#login-loja').get_attribute('readonly') is not None
    assert page.locator('#login-loja').input_value()=='151'
    print('STORE LOCKED:',page.locator('#login-loja').get_attribute('readonly'))
    print('JS ERRORS:',errors)
    assert not errors
    browser.close()
