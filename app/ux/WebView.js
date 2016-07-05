/**
 * Default config for all webviews created
 */
Ext.define('Rambox.ux.WebView',{
	 extend: 'Ext.panel.Panel'
	,xtype: 'webview'

	// private
	,notifications: 0

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

		Ext.apply(me, {
			 items: [{
				 xtype: 'component'
				,hideMode: 'offsets'
				,autoEl: {
					 tag: 'webview'
					,src: me.src
					,style: 'width:100%;height:100%;'
					,partition: 'persist:' + me.type + '_' + me.id.replace('tab_', '') + (localStorage.getItem('id_token') ? '_' + Ext.decode(localStorage.getItem('profile')).user_id : '')
					,plugins: 'true'
					,allowtransparency: 'on'
					,autosize: 'on'
					,blinkfeatures: 'ApplicationCache,GlobalCacheStorage'
					,useragent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2486.0 Safari/537.36 Edge/13.10586' // Used to enable video and audio calls in Skype
				}
			}]
			,tabConfig: {
				listeners: {
					badgetextchange: me.onBadgeTextChange
				}
				,clickEvent: 'dblclick'
				,menu: [
					{
						 text: 'Reload'
						,glyph: 'xf021@FontAwesome'
						,scope: me
						,handler: me.reloadService
					}
				]
			}
			,listeners: {
				 afterrender: me.onAfterRender
			}
		});

		me.callParent(config);
	}

	,onBadgeTextChange: function( tab, badgeText, oldBadgeText ) {
		if ( oldBadgeText === null ) oldBadgeText = 0;
		var actualNotifications = Rambox.app.getTotalNotifications();
		Rambox.app.setTotalNotifications(actualNotifications - parseInt(oldBadgeText) + parseInt(badgeText));
	}

	,onAfterRender: function() {
		var me = this;
		var webview = me.down('component').el.dom;

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
			if ( !webview.isAudioMuted() && me.muted ) webview.setAudioMuted(me.muted);

			// Injected code to detect new messages
			if ( me.record && me.record.get('js_unread') !== '' ) {
				console.info('JS Injected', me.src);
				console.log(me.record.get('js_unread'));
				webview.executeJavaScript(me.record.get('js_unread'));
			}

			// Scroll always to top (bug)
			webview.executeJavaScript('document.body.scrollTop=0;');
		});

		webview.addEventListener("page-title-updated", function(e) {
			var count = e.title.match(/\(([^)]+)\)/); // Get text between (...)
				count = count ? count[1] : '0';
				count = count.match(/\d+/g); // Some services have special characters. Example: (•)
				count = count ? parseInt(count[0]) : 0;

			switch ( me.type ) {
				case 'messenger':
					if ( count !== me.notifications && count > 0 ) {
						me.notifications = count;
					}
					if ( count || e.title === 'Messenger' ) {
						me.tab.setBadgeText(count);
					}
					if ( e.title === 'Messenger' ) me.notifications = 0;
					break;
				case 'hangouts':
					if ( count !== me.notifications && count > 0 ) {
						me.notifications = count;
					}
					if ( count || e.title === 'Google Hangouts' ) {
						me.tab.setBadgeText(count);
					}
					if ( e.title === 'Google Hangouts' ) me.notifications = 0;
					break;
				default:
					me.tab.setBadgeText(count);
					me.notifications = count;
					break;
			}
		});
	}

	,reloadService: function(btn) {
		var me = this;
		var webview = me.down('component').el.dom;

		webview.reload();
	}
});
