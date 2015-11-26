var routes = require('routes');
var EventEmitter = require('events').EventEmitter;
var loc = new (require('location-bar'))();
var noop = function() {};

function router(settings) {

	if( !( this instanceof router ) ) {

		return new router(settings);
	}

	var s = this.s = settings || {};

	s.postHash = s.postHash || '!';

	this.lastRoute = null;
	this.childRouter = null;
	this.childFullRoute = null;
	this.childBaseRoute = null;
	this.router = routes();

	EventEmitter.call(this);
}

var p = router.prototype = Object.create(EventEmitter.prototype);

p.init = function() {

	var s = this.s;
	var i;

	// figure out a start section
	if( s[ '/' ] === undefined ) {

		// find the first path which would be a section
		for(i in s) {

			if( i[ 0 ] == '/' ) {

				s.start = i;

				break;
			}
		}
	} else {

		s.start = '/';
	}


	// now setup routes
	for(i in s) {

		if( i[ 0 ] == '/' || i == '404') {

			this.router.addRoute(i, noop);
		}
	}

	this.onURL = this.onURL.bind(this);

	if( global.location ) {
		loc.start({pushState: this.s.pushState!==undefined ? this.s.pushState : true});
		this.hasPushState = loc.hasPushState();
		loc.onChange(this.onURL);
	}

	this.onURL(); // force a hash change to start things up
	
	return this;
};

p.sub = function(settings) {

	// remove all veriable parts from lastRoute
	var splitIdx1 = this.lastRoute.indexOf('*');
	var splitIdx2 = this.lastRoute.indexOf(':');
	var splitIdx;

	if(splitIdx1 === -1 && splitIdx2 === -1) {
		throw new Error('when creating a sub router the parent route should have a variable route using either : or *');
	} else {
		splitIdx1 = splitIdx1 !== -1 ? splitIdx1 : this.lastRoute.length;
		splitIdx2 = splitIdx2 !== -1 ? splitIdx2 : this.lastRoute.length;
		splitIdx = splitIdx1 < splitIdx2 ? splitIdx1 : splitIdx2;
	}

	this.childFullRoute = this.lastRoute;
	this.childBaseRoute = this.lastRoute.substring(0, splitIdx - 1);

	settings.postHash = this.s.postHash + this.childBaseRoute;

	this.childRouter = new router(settings);

	this.emit('sub_create', {
		route: this.childFullRoute,
		router: this.childRouter
	});

	return this.childRouter;
};

p.destroySub = function(route) {

	// this.childBaseRoute
	if(this.childRouter && route.indexOf(this.childBaseRoute) !== 0) {
		this.childRouter.destroy();

		this.emit('sub_destroy', {
			route: this.childFullRoute,
			router: this.childRouter
		});

		this.childFullRoute = null;
		this.childBaseRoute = null;
		this.childRouter = null;
	}
};

p.destroy = function() {

	if(global.location) {
		location.stop();
	}
};

p.add = function(route, section) {

	var s = this.s;

	s[ route ] = section;

	return this;
};

p.go = function(routeStr) {

	var routeData;
	var section;
	var newURL;
	var doURLChange;

	if( routeStr.charAt(0) != '/' ) {
		routeStr = '/' + routeStr;
	}

	newURL = (this.hasPushState ? '' : this.s.postHash) + routeStr;
	routeData = this.getRouteData(routeStr) || this.getRouteData('404');
	section = this.getSection(routeData);
	doURLChange = this.useURL(section);

	// if this is not a section descriptor or it is a descriptor and we should updateURL
	if( global.location && doURLChange ) {
		var url = this.hasPushState ? global.location.pathname : global.location.hash.replace(/^#/, '');
		if(url != newURL) {
			loc.update(newURL,{trigger: true});
		} else if(section.duplicate || !section.useURL) {
			// Check if duplicate is set. The check is done here since, onhashchange event triggers 
			// only when url changes and therefore cannot check to allow duplicate/repeating route

			// Additionally check if useURL is set to false. If not, the route is not triggered by
			// url changes
			this.doRoute(routeData, section, routeStr);
		} 
	} else if( !global.location || !doURLChange ) {
		this.doRoute(routeData, section, routeStr);
	}
};

p.doRoute = function(routeData, section, path) {

	var s = this.s;

	// check if this is a redirect
	if( typeof section == 'string' ) {

		this.go(section);
	} else { 

		if(routeData.route !== this.lastResolvedRoute || section.duplicate) {

			this.lastResolvedRoute = routeData.route;

			// otherwise treat it as a regular section
			// if this is a object definition vs a section definition (regular section or array)
			this.emit('route', {
				section: section.section || section,
				route: routeData,
				path: path
			});
		}
	} 
};

p.getRouteData = function(routeStr) {

	var routeData = this.router.match(routeStr);

	if(routeData) {
		this.lastRoute = routeData.route;
		this.destroySub(routeData.route);
	}

	return routeData;
};

p.getSection = function(routeData) {

	if(routeData) {

		return this.s[ routeData.route ];
	} else {

		return null;
	}
};

p.useURL = function(section) {

	return section && 
		   ( section.section === undefined ||  // if this is not a section descriptor update url
		   ( section.section && section.useURL || section.useURL === undefined ) ); //is descriptor and has useURL or undefined
};

p.onURL = function(url) {
	var routeStr = '/';
	var routeData;
	var section;

	if( global.location && url!==undefined ) {

		if (url.charAt(0) != '/') url = '/' + url;
		// if we've already looked at this url then just get out of this function
		if(url === this.resolved) {
			return;
		}

		this.resolved = url;
		routeStr = this.hasPushState ? url : url.substr(1 + this.s.postHash.length);
	}

	routeData = this.getRouteData(routeStr) || this.getRouteData('404');
	section = this.getSection(routeData);

	// see if we can deep link into this section (either normal or 404 section)
	if( this.useURL(section) ) {
		this.doRoute(routeData, section, routeStr);
	// else check if there's a 404 if so then go there
	} else if( this.s['404'] ){

		routeData = this.getRouteData('404');
		section = this.getSection(routeData);
		this.doRoute(routeData, section, routeStr);
	}
};

module.exports = router;