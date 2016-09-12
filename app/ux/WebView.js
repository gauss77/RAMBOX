/**
 * Default config for all webviews created
 */
Ext.define('Rambox.ux.WebView',{
	 extend: 'Ext.panel.Panel'
	,xtype: 'webview'

	,requires: [
		'Rambox.util.Format'
	]

	// private
	,zoomLevel: 0

	// CONFIG
	,hideMode: 'offsets'
	,initComponent: function(config) {
		var me = this;

		function getLocation(href) {
			var match = href.match(/^(https?\:)\/\/(([^:\/?#]*)(?:\:([0-9]+))?)(\/[^?#]*)(\?[^#]*|)(#.*|)$/);
			return match && {
				protocol: match[1],
				host: match[2],
				hostname: match[3],
				port: match[4],
				pathname: match[5],
				search: match[6],
				hash: match[7]
			}
		}

		// Allow Custom sites with self certificates
		if ( me.record.get('trust') ) ipc.send('allowCertificate', me.src);

		Ext.apply(me, {
			 items: me.webViewConstructor(me.record.get('enabled'))
			,tabConfig: {
				listeners: {
					 badgetextchange: me.onBadgeTextChange
					,afterrender : function( btn ) {
						btn.el.on('contextmenu', function(e) {
							btn.showMenu('contextmenu');
							e.stopEvent();
						});
					}
				}
				,clickEvent: ''
				,style: !me.record.get('enabled') ? '-webkit-filter: grayscale(1)' : ''
				,menu:  {
					 plain: true
					,items: [
						{
							 xtype: 'toolbar'
							,items: [
								{
									 xtype: 'segmentedbutton'
									,allowToggle: false
									,flex: 1
									,items: [
										{
											 text: 'Back'
											,glyph: 'xf053@FontAwesome'
											,flex: 1
											,scope: me
											,handler: me.goBack
										}
										,{
											 text: 'Foward'
											,glyph: 'xf054@FontAwesome'
											,iconAlign: 'right'
											,flex: 1
											,scope: me
											,handler: me.goForward
										}
									]
								}
							]
						}
						,'-'
						,{
							 text: 'Zoom In'
							,glyph: 'xf00e@FontAwesome'
							,scope: me
							,handler: me.zoomIn
						}
						,{
							 text: 'Zoom Out'
							,glyph: 'xf010@FontAwesome'
							,scope: me
							,handler: me.zoomOut
						}
						,{
							 text: 'Reset Zoom'
							,glyph: 'xf002@FontAwesome'
							,scope: me
							,handler: me.resetZoom
						}
						,'-'
						,{
							 text: 'Reload'
							,glyph: 'xf021@FontAwesome'
							,scope: me
							,handler: me.reloadService
						}
						,'-'
						,{
							 text: 'Toggle Developer Tools'
							,glyph: 'xf121@FontAwesome'
							,scope: me
							,handler: me.toggleDevTools
						}
					]
				}
			}
			,listeners: {
				 afterrender: me.onAfterRender
			}
		});

		me.callParent(config);
	}

	,webViewConstructor: function(enabled) {
		var me = this;

		if ( !enabled ) {
			return {
				 xtype: 'container'
				,html: '<h3>Service Disabled</h3>'
				,style: 'text-align:center;'
				,padding: 100
			};
		} else {
			return {
				 xtype: 'component'
				,hideMode: 'offsets'
				,autoRender: true
				,autoShow: true
				,autoEl: {
					 tag: 'webview'
					,src: me.src
					,style: 'width:100%;height:100%;'
					,partition: 'persist:' + me.type + '_' + me.id.replace('tab_', '') + (localStorage.getItem('id_token') ? '_' + Ext.decode(localStorage.getItem('profile')).user_id : '')
					,plugins: 'true'
					,allowtransparency: 'on'
					,autosize: 'on'
					,allowpopups: 'on'
					,blinkfeatures: 'ApplicationCache,GlobalCacheStorage'
					,useragent: Ext.getStore('ServicesList').getById(me.type).get('userAgent')
				}
			};
		}
	}

	,onBadgeTextChange: function( tab, badgeText, oldBadgeText ) {
		if ( oldBadgeText === null ) oldBadgeText = 0;
		var actualNotifications = Rambox.app.getTotalNotifications();

		oldBadgeText = Rambox.util.Format.stripNumber(oldBadgeText);
		badgeText = Rambox.util.Format.stripNumber(badgeText);

		Rambox.app.setTotalNotifications(actualNotifications - oldBadgeText + badgeText);
	}

	,onAfterRender: function() {
		var me = this;

		if ( !me.record.get('enabled') ) return;

		var webview = me.down('component').el.dom;

		// Google Analytics Event
		ga_storage._trackEvent('Services', 'load', me.type, 1, true);

		// Notifications in Webview
		me.setNotifications(localStorage.getItem('locked') || JSON.parse(localStorage.getItem('dontDisturb')) ? false : me.record.get('notifications'));

		// Show and hide spinner when is loading
		webview.addEventListener("did-start-loading", function() {
			console.info('Start loading...', me.src);
			me.mask('Loading...', 'bottomMask');
			// Manually remove modal from mask
			Ext.cq1('#'+me.id).el.dom.getElementsByClassName('bottomMask')[0].parentElement.className = '';
		});
		webview.addEventListener("did-stop-loading", function() {
			me.unmask();
		});

		webview.addEventListener("did-finish-load", function(e) {
			Rambox.app.setTotalServicesLoaded( Rambox.app.getTotalServicesLoaded() + 1 );
		});

		// Open links in default browser
		webview.addEventListener('new-window', function(e) {
			switch ( me.type ) {
				case 'skype':
					// hack to fix multiple browser tabs on Skype link click, re #11
					if ( e.url.match('https:\/\/web.skype.com\/..\/undefined') ) {
						e.preventDefault();
						return;
					} else if ( e.url.indexOf('imgpsh_fullsize') >= 0 ) {
						ipc.send('image:download', e.url, e.target.partition);
						e.preventDefault();
						return;
					}
					break;
				case 'hangouts':
					if ( e.url.indexOf('plus.google.com/u/0/photos/albums') >= 0 ) {
						ipc.send('image:popup', e.url, e.target.partition);
						e.preventDefault();
						return;
					}
					break;
				default:
					break;
			}

			const protocol = require('url').parse(e.url).protocol;
			if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
				e.preventDefault();
				require('electron').shell.openExternal(e.url);
			}
		});

		webview.addEventListener('will-navigate', function(e, url) {
			e.preventDefault();
		});

		webview.addEventListener("dom-ready", function(e) {
			// Mute Webview
			if ( me.record.get('muted') || localStorage.getItem('locked') || JSON.parse(localStorage.getItem('dontDisturb')) ) me.setAudioMuted(true, true);

			// Injected code to detect new messages
			if ( me.record ) {
				var js_unread = Ext.getStore('ServicesList').getById(me.record.get('type') === 'office365' ? 'outlook365' : me.record.get('type')).get('js_unread');
				js_unread = js_unread + me.record.get('js_unread');
				if ( js_unread !== '' ) {
					console.groupCollapsed(me.record.get('type').toUpperCase() + ' - JS Injected to Detect New Messages');
					console.info(me.type);
					console.log(js_unread);
					webview.executeJavaScript(js_unread);
				}
			}

			// Prevent Title blinking (some services have) and only allow when the title have an unread regex match: "(3) Title"
			if ( Ext.getStore('ServicesList').getById(me.record.get('type')).get('titleBlink') ) {
				var js_preventBlink = 'var originalTitle=document.title;Object.defineProperty(document,"title",{configurable:!0,set:function(a){null===a.match(new RegExp("[(]([0-9•]+)[)][ ](.*)","g"))&&a!==originalTitle||(document.getElementsByTagName("title")[0].innerHTML=a)},get:function(){return document.getElementsByTagName("title")[0].innerHTML}});';
				console.log(js_preventBlink);
				webview.executeJavaScript(js_preventBlink);
			}
			console.groupEnd();

			// Scroll always to top (bug)
			webview.executeJavaScript('document.body.scrollTop=0;');
		});

		webview.addEventListener("page-title-updated", function(e) {
			var count = e.title.match(/\(([^)]+)\)/); // Get text between (...)
				count = count ? count[1] : '0';
				count = count === '•' ? count : Ext.isArray(count.match(/\d+/g)) ? count.match(/\d+/g).join("") : count.match(/\d+/g); // Some services have special characters. Example: (•)
				count = count === null ? '0' : count;

			me.tab.setBadgeText(Rambox.util.Format.formatNumber(count));
		});

		webview.addEventListener('did-get-redirect-request', function( e ) {
			if ( e.isMainFrame ) Ext.defer(function() { webview.loadURL(e.newURL); }, 1000);
		});
	}

	,reloadService: function(btn) {
		var me = this;
		var webview = me.down('component').el.dom;

		if ( me.record.get('enabled') ) webview.loadURL(me.src);
	}

	,toggleDevTools: function(btn) {
		var me = this;
		var webview = me.down('component').el.dom;

		if ( me.record.get('enabled') ) webview.isDevToolsOpened() ? webview.closeDevTools() : webview.openDevTools();
	}

	,setAudioMuted: function(muted, calledFromDisturb) {
		var me = this;
		var webview = me.down('component').el.dom;

		if ( !muted && !calledFromDisturb && JSON.parse(localStorage.getItem('dontDisturb')) ) return;

		if ( me.record.get('enabled') ) webview.setAudioMuted(muted);
	}

	,setNotifications: function(notification, calledFromDisturb) {
		var me = this;
		var webview = me.down('component').el.dom;

		if ( notification && !calledFromDisturb && JSON.parse(localStorage.getItem('dontDisturb')) ) return;

		if ( me.record.get('enabled') ) ipc.send('setServiceNotifications', webview.partition, notification);
	}

	,setEnabled: function(enabled) {
		var me = this;

		me.removeAll();
		me.add(me.webViewConstructor(enabled));
		if ( enabled ) {
			me.resumeEvent('afterrender');
			me.show();
			me.tab.setStyle('-webkit-filter', 'grayscale(0)');
		} else {
			me.suspendEvent('afterrender');
			me.tab.setStyle('-webkit-filter', 'grayscale(1)');
		}
	}

	,goBack: function() {
		var me = this;
		var webview = me.down('component').el.dom;

		if ( me.record.get('enabled') ) webview.goBack();
	}

	,goForward: function() {
		var me = this;
		var webview = me.down('component').el.dom;

		if ( me.record.get('enabled') ) webview.goForward();
	}

	,zoomIn: function() {
		var me = this;
		var webview = me.down('component').el.dom;

		me.zoomLevel = me.zoomLevel + 0.25;
		if ( me.record.get('enabled') ) webview.getWebContents().setZoomLevel(me.zoomLevel);
	}

	,zoomOut: function() {
		var me = this;
		var webview = me.down('component').el.dom;

		me.zoomLevel = me.zoomLevel - 0.25;
		if ( me.record.get('enabled') ) webview.getWebContents().setZoomLevel(me.zoomLevel);
	}

	,resetZoom: function() {
		var me = this;
		var webview = me.down('component').el.dom;

		me.zoomLevel = 0;
		if ( me.record.get('enabled') ) webview.getWebContents().setZoomLevel(0);
	}
});
