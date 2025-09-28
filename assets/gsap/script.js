document.addEventListener("DOMContentLoaded", (event) => {
  gsap.registerPlugin(MorphSVGPlugin)
  // gsap code here!
 });


var app = angular.module('app', ['ngMaterial']);

app.controller('switch_ctrl', ['$scope', '$element', function($, iElm){
	$.bubble = iElm[0].querySelector('.switch_bubble');
	$.action = {
		mode: "statbs21d"
	};
	$.bubblisity = function() {
		var goo_r = "m374.46898 548.22101c0 31.09552-23.46384 46.8216-48.30342 42.30342-14.47387-2.63271-45.5056-19.85157-65.44189-27.20312-22.20319-8.18748-40.86153 1.28386-40.86153-15.1003 0-16.48716 18.89368-7.0702 41.28072-15.25421 19.8359-7.25139 50.60538-24.69441 65.0227-27.04921 25.53469-4.17062 48.30342 11.2079 48.30342 42.30342z",
			goo_l = "m261.51459 548.22101c0 31.09552 25.46384 40.8216 50.30342 36.30342 14.47387-2.63271 43.5056-13.85157 63.44189-21.20312 22.20319-8.18748 40.86153 1.28386 40.86153-15.1003 0-16.48716-18.89368-7.0702-41.28072-15.25421-19.8359-7.25139-48.60538-18.69441-63.0227-21.04921-25.53469-4.17062-50.30342 5.2079-50.30342 36.30342z",
			ungoo = "m375.35325 548.30017a57.266888 57.266888 0 0 1-57.26689 57.26689 57.266888 57.266888 0 0 1-57.26688-57.26689 57.266888 57.266888 0 0 1 57.26688-57.26689 57.266888 57.266888 0 0 1 57.26689 57.26689z";

		if ($.action.mode == "statbs21d") {
			TweenMax.to($.bubble, 0.7, {
				xPercent: 0,
				ease: Power3.easeInOut
			});
			TweenMax.to($.bubble.querySelector('path'), 0.45, {
				morphSVG: goo_l,
				ease: Power2.easeIn
			});
			TweenMax.to($.bubble.querySelector('path'), 0.55, {
				morphSVG: ungoo,
				delay:0.45,
				ease: Elastic.easeOut.config( 0.4, 0.25)
			});
		} else {
			TweenMax.to($.bubble, 0.7, {
				xPercent: 95, /*70/95*/
				ease: Power3.easeInOut
			});
			TweenMax.to($.bubble.querySelector('path'), 0.45, {
				morphSVG: goo_r,
				ease: Power2.easeIn
			});
			TweenMax.to($.bubble.querySelector('path'), 0.55, {
				morphSVG: ungoo,
				delay:0.45,
				ease: Elastic.easeOut.config( 0.4, 0.25)
			});
		};

	}
}]);

/* SWITCH */

const inputs = document.querySelectorAll('input[name="area"]');
  const labels = document.querySelectorAll('label.option'); 
  //const labelx = document.querySelectorAll('label.nms');

  function updateAria() {
    inputs.forEach((input, idx) => {
      labels[idx].setAttribute('aria-checked', input.checked ? 'true' : 'false');
	 // labelx[idx].setAttribute('aria-hidden', input.checked ? 'true' : 'false');
    });
  }

  inputs.forEach(input => {
    input.addEventListener('change', () => {
      updateAria();
    });
  });

  // Allow keyboard navigation on labels for better accessibility
  labels.forEach(label => {
    label.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        document.getElementById(label.getAttribute('for')).checked = true;
        updateAria();
      }
    });
  });

  // initialize aria states correctly on load
  updateAria();

$('svg[class="icon"]').on('hover', function(){
	 var switchx = $('input[name="switch"]:checked').val();
	 alert(switchx);
	});