/*************************************************
 * Textarea Manager
 *
 * An abstraction layer wrapping the textarea in
 * an object with methods to manipulate and listen
 * to events on, that hides all the nasty cross-
 * browser incompatibilities behind a uniform API.
 *
 * Design goal: This is a *HARD* internal
 * abstraction barrier. Cross-browser
 * inconsistencies are not allowed to leak through
 * and be dealt with by event handlers. All future
 * cross-browser issues that arise must be dealt
 * with here, and if necessary, the API updated.
 *
 * Organization:
 * - key values map and stringify()
 * - manageTextarea()
 *    + defer() and flush()
 *    + event handler logic
 *    + attach event handlers and export methods
 *
 * We put focus into a span[tabindex=0] by default.
 * This prevents virtual keyboards from opening on
 * touch-enabled devices. But, that has the effect
 * of disabling real keyboards. Focus is shifted
 * from the span[tabindex=0] to a textarea the
 * moment a keydown event is fired. The side-effect
 * of the keydown still takes place within the
 * textarea. The textarea is used from that moment
 * on until the textarea is blurred. At that point
 * we disable the textarea again until the next
 * keydown event.
 ************************************************/

// TODO - create the textarea and spanarea within the
// textarea manager in order to better enforce the
// *HARD* internal abstraction barrier.

var manageTextarea = (function() {
  
  var NONE = 0;
  var SPANAREA = 1;
  var TEXTAREA = 2;
  
  // The following [key values][1] map was compiled from the
  // [DOM3 Events appendix section on key codes][2] and
  // [a widely cited report on cross-browser tests of key codes][3],
  // except for 10: 'Enter', which I've empirically observed in Safari on iOS
  // and doesn't appear to conflict with any other known key codes.
  //
  // [1]: http://www.w3.org/TR/2012/WD-DOM-Level-3-Events-20120614/#keys-keyvalues
  // [2]: http://www.w3.org/TR/2012/WD-DOM-Level-3-Events-20120614/#fixed-virtual-key-codes
  // [3]: http://unixpapa.com/js/key.html
  var KEY_VALUES = {
    8: 'Backspace',
    9: 'Tab',

    10: 'Enter', // for Safari on iOS

    13: 'Enter',

    16: 'Shift',
    17: 'Control',
    18: 'Alt',
    20: 'CapsLock',

    27: 'Esc',

    32: 'Spacebar',

    33: 'PageUp',
    34: 'PageDown',
    35: 'End',
    36: 'Home',

    37: 'Left',
    38: 'Up',
    39: 'Right',
    40: 'Down',

    45: 'Insert',

    46: 'Del',

    144: 'NumLock'
  };
  
  function stopEvent (evt) {
    evt.stopPropagation();
    evt.stopImmediatePropagation();
  }
  
  // To the extent possible, create a normalized string representation
  // of the key combo (i.e., key code and modifier keys).
  function stringify(evt) {
    var which = evt.which || evt.keyCode;
    var keyVal = KEY_VALUES[which];
    var key;
    var modifiers = [];

    if (evt.ctrlKey) modifiers.push('Ctrl');
    if (evt.originalEvent && evt.originalEvent.metaKey) modifiers.push('Meta');
    if (evt.altKey) modifiers.push('Alt');
    if (evt.shiftKey) modifiers.push('Shift');

    key = keyVal || String.fromCharCode(which);

    if (!modifiers.length && !keyVal) return key;

    modifiers.push(key);
    return modifiers.join('-');
  }
  
  // A global listener that's attached once. It monitors for keydown events.
  // Whenever one occurs, it checks if the currently active element has
  // permission to enable the physical keyboard for a mathquill. If so,
  // it calls the closured function to do so. When that mathquill loses focus
  // it will automatically disable the keyboard again. This means that a 
  // bluetooh keyboard can be added and removed throught a session and we'll
  // update the mathquills accordingly. The only edge case is if you remove
  // a keyboard while editing a mathquill. In that case, the virtual keypad
  // will popup.
  $(document).on('keydown', function () {
    var activeElement = document.activeElement;
    var enableKeyboard = $(activeElement).data('enablePhysicalKeyboard')
    if (enableKeyboard) {
      enableKeyboard();
    }
  });
  
  // Sets up the listeners to automatically switch between spanarea and
  // the textarea. This allows us to use the physical keyboard wihtout
  // bringing up a native virtual keyboard when a physical keyboard is
  // not present. Should only be used when there is a user supplied
  // keypad present.
  //
  // We enable physical keyboards when this mathquill's spanara is
  // focused and we observe a native 'keydown' event. We assume
  // that command came from a physical keyboard. We JIT switch 
  // focus to a real textarea in order to catch the keypress.
  function autoSwitchTextarea (spanarea, textarea, exports) {
    var focusedElement = NONE;
    
    function disablePhysicalKeyboard () {
      spanarea.attr('tabindex', '0');
      
      // must actively blur textarea before setting to disabled.
      // IE does some funny thing where it changes focus to somewhere
      // else.
      textarea.blur();
      textarea.attr('disabled', 'true');
    }
    
    function enablePhysicalKeyboard () {
      focusedElement = TEXTAREA;
      spanarea.removeAttr('tabindex');
      textarea.removeAttr('disabled');
      textarea.focus();
      textarea.select();
    }
    
    exports.focus = function () {
      if (focusedElement === NONE) {
        spanarea.focus();
      }
    };
    
    exports.blur = function () {
      if (focusedElement === TEXTAREA) {
        textarea.blur();
      }
      if (focusedElement === SPANAREA) {
        spanarea.blur();
      }
    };
    
    // we do some work to make sure that focusin and focusout
    // events are only fired once and are fired only when they
    // should be. The transition from spanarea being focused to
    // textarea being focused needs to happen silently. This
    // code makes sure that happens. It also eliminates multiple
    // focusin and focusout events from being fired in IE.
    spanarea.on('focusin', function (evt) {
      if (focusedElement !== NONE) {
        stopEvent(evt);
      } else {
        focusedElement = SPANAREA;
        exports.onFocus();
      }
    }).on('focusout', function (evt) {
      if (focusedElement !== SPANAREA) {
        stopEvent(evt);
      } else {
        focusedElement = NONE;
        exports.onBlur();
      }
    });

    textarea.on('focusin', function (evt) {
      stopEvent(evt);
      // enablePhysicalKeyboard will set 
      // focusedElement = TEXTAREA
    }).on('focusout', function (evt) {
      if (focusedElement !== TEXTAREA) {
        stopEvent(evt);
      } else {
        focusedElement = NONE;
        disablePhysicalKeyboard();
        exports.onBlur();
      }
    });
    
    // if we get a keydown event while this element is active, we'll
    // enable the physical physical keyboard.
    spanarea.data('enablePhysicalKeyboard', enablePhysicalKeyboard);

    // start off with spanarea enabled
    disablePhysicalKeyboard();
  }
  
  // this defaults to how mathquill normally works. We always back
  // the textareaManager with a real textarea. This is the effect of
  // always bringing up the native virtual keyboard on devices that
  // do not have a physical keyboard attached.
  function alwaysUseTextarea (spanarea, textarea, exports) {
    var focusedElement = NONE;
    
    exports.focus = function () {
      if (focusedElement === NONE) {
        textarea.focus();
      }
    };
    
    exports.blur = function () {
      if (focusedElement === TEXTAREA) {
        textarea.blur();
      }
    };
    
    // we do some work to make sure that focusin and focusout
    // events are only fired once and are fired only when they
    // should be. The transition from spanarea being focused to
    // textarea being focused needs to happen silently. This
    // code makes sure that happens. It also eliminates multiple
    // focusin and focusout events from being fired in IE.
    textarea.on('focusin', function (evt) {
      if (focusedElement !== NONE) {
        stopEvent(evt);
      } else {
        focusedElement = TEXTAREA;
        exports.onFocus();
      }
    }).on('focusout', function (evt) {
      if (focusedElement !== TEXTAREA) {
        stopEvent(evt);
      } else {
        focusedElement = NONE;
        exports.onBlur();
      }
    });
  }
  

  // create a textarea manager that calls callbacks at useful times
  // and exports useful public methods
  return function manageTextarea(textarea, spanarea, opts) {
    var exports = {}
    var keydown = null;
    var keypress = null;

    if (!opts) opts = {};
    var textCallback = opts.text || noop;
    var keyCallback = opts.key || noop;
    var pasteCallback = opts.paste || noop;
    var onCut = opts.cut || noop;

    var target = $(opts.container || textarea);

    // defer() runs fn immediately after the current thread.
    // flush() will run it even sooner, if possible.
    // flush always needs to be called before defer, and is called a
    // few other places besides.
    var timeout, deferredFn;
    
    function defer(fn) {
      timeout = setTimeout(fn);
      deferredFn = fn;
    }

    function flush() {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
        deferredFn();
      }
    }
    
    // -*- public methods -*- //    
    exports.onFocus = function () {}
    exports.onBlur = function () {}
    
    exports.select = function (text) {
      flush();

      textarea.val(text);
      
      // IE throws error if you try to select an unfocused textarea
      if (text && document.activeElement === textarea[0]) {
        textarea[0].select();
      }
    }
    
    if (window.overrideNativeOnscreenKeypad) {
      autoSwitchTextarea(spanarea, textarea, exports);
    } else {
      alwaysUseTextarea(spanarea, textarea, exports);
    }
    
    target.bind('keydown keypress input keyup focusout paste', flush);
    
    // -*- helper subroutines -*- //

    // Determine whether there's a selection in the textarea.
    // This will always return false in IE < 9, which don't support
    // HTMLTextareaElement::selection{Start,End}.
    function hasSelection() {
      var dom = textarea[0];

      if (!('selectionStart' in dom)) return false;
      return dom.selectionStart !== dom.selectionEnd;
    }

    function popText(callback) {
      var text = textarea.val();
      textarea.val('');
      if (text) callback(text);
    }

    function handleKey() {
      keyCallback(stringify(keydown), keydown);
    }

    // -*- event handlers -*- //
    function onKeydown(e) {
      keydown = e;
      keypress = null;

      handleKey();
    }

    function onKeypress(e) {
      // call the key handler for repeated keypresses.
      // This excludes keypresses that happen directly
      // after keydown.  In that case, there will be
      // no previous keypress, so we skip it here
      if (keydown && keypress) handleKey();

      keypress = e;

      defer(function() {
        // If there is a selection, the contents of the textarea couldn't
        // possibly have just been typed in.
        // This happens in browsers like Firefox and Opera that fire
        // keypress for keystrokes that are not text entry and leave the
        // selection in the textarea alone, such as Ctrl-C.
        // Note: we assume that browsers that don't support hasSelection()
        // also never fire keypress on keystrokes that are not text entry.
        // This seems reasonably safe because:
        // - all modern browsers including IE 9+ support hasSelection(),
        //   making it extremely unlikely any browser besides IE < 9 won't
        // - as far as we know IE < 9 never fires keypress on keystrokes
        //   that aren't text entry, which is only as reliable as our
        //   tests are comprehensive, but the IE < 9 way to do
        //   hasSelection() is poorly documented and is also only as
        //   reliable as our tests are comprehensive
        // If anything like #40 or #71 is reported in IE < 9, see
        // b1318e5349160b665003e36d4eedd64101ceacd8

        //updated by Eli
        //in Safari, when text is selected inside of the textarea
        //and then a key is pressed, there's a brief moment where
        //the new text is selected. This circumvents that problem, by
        //trying again a moment later
        //this should be a no-op except in Safari
        //NOTE / TODO: this still seems to introduce a problem with vertical
        //alignment. In DCG, try:
        // * type "1"
        // * highlight the "1"
        // * type "/"
        // note that vertical alignment of the icon is broken
        // it's only fixed when another action is taken that changes
        // vertical alignment (i.e. a division inside of one of the
        // division signs)
        if (hasSelection()) {
          setTimeout(function() {
            if (!hasSelection())
              popText(textCallback);
          });
        } else {
          popText(textCallback);
        }

        if (hasSelection()) return;

        popText(textCallback);
      });
    }

    function onBlur() { keydown = keypress = null; }

    function onPaste(e) {
      // browsers are dumb.
      //
      // In Linux, middle-click pasting causes onPaste to be called,
      // when the textarea is not necessarily focused.  We focus it
      // here to ensure that the pasted text actually ends up in the
      // textarea.
      //
      // It's pretty nifty that by changing focus in this handler,
      // we can change the target of the default action.  (This works
      // on keydown too, FWIW).
      //
      // And by nifty, we mean dumb (but useful sometimes).
      textarea.focus();

      defer(function() {
        popText(pasteCallback);
      });
    }

    // -*- attach event handlers -*- //
    target.bind({
      keydown: onKeydown,
      keypress: onKeypress,
      focusout: onBlur,
      cut: onCut,
      paste: onPaste
    });

    // -*- export public methods -*- //
    return exports;
  };
}());
