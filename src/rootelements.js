/*********************************************
 * Root math elements with event delegation.
 ********************************************/

function createRoot(jQ, root, textbox, editable) {
  var contents = jQ.contents().detach();

  if (!textbox) {
    jQ.addClass('mathquill-rendered-math');
  }

  root.jQ = jQ.data(jQueryDataKey, {
    block: root,
    revert: function() {
      jQ.empty().unbind('.mathquill')
        .removeClass('mathquill-rendered-math mathquill-editable mathquill-textbox')
        .append(contents);
    }
  });

  var cursor = root.cursor = new Cursor(root);

  root.renderLatex(contents.text());

  //textarea stuff
  var textareaSpan = root.textarea = $.browser.webkit && /Mobile/.test(navigator.userAgent) ?
      $('<span class="textarea"><span tabindex=0></span></span>')
    : $('<span class="textarea"><textarea></textarea></span>'),
    textarea = textareaSpan.children(),
    blurred;

  /******
   * TODO [Han]: Document this
   */
  var textareaSelectionTimeout;
  root.selectionChanged = function() {
    if (textareaSelectionTimeout === undefined) {
      textareaSelectionTimeout = setTimeout(setTextareaSelection);
    }
    forceIERedraw(jQ[0]);
  };
  function setTextareaSelection() {
    textareaSelectionTimeout = undefined;
    var latex = cursor.selection ? '$'+cursor.selection.latex()+'$' : '';
    textarea.val(latex);
    if (latex) {
      textarea[0].select();
    }
  }

  //prevent native selection except textarea
  jQ.bind('selectstart.mathquill', function(e) {
    if (e.target !== textarea[0]) e.preventDefault();
    e.stopPropagation();
  });

  //drag-to-select event handling
  var anticursor, blink = cursor.blink;
  jQ.bind('mousedown.mathquill', function(e) {
    function mousemove(e) {
      cursor.seek($(e.target), e.pageX, e.pageY);

      if (cursor.prev !== anticursor.prev
          || cursor.parent !== anticursor.parent) {
        cursor.selectFrom(anticursor);
      }

      return false;
    }

    // docmousemove is attached to the document, so that
    // selection still works when the mouse leaves the window.
    function docmousemove(e) {
      // [Han]: i delete the target because of the way seek works.
      // it will not move the mouse to the target, but will instead
      // just seek those X and Y coordinates.  If there is a target,
      // it will try to move the cursor to document, which will not work.
      // cursor.seek needs to be refactored.
      delete e.target;

      return mousemove(e);
    }

    function mouseup(e) {
      anticursor = undefined;
      cursor.blink = blink;
      if (!cursor.selection) {
        if (editable) {
          cursor.show();
        }
        else {
          textareaSpan.detach();
        }
      }

      // delete the mouse handlers now that we're not dragging anymore
      jQ.unbind('mousemove', mousemove);
      $(document).unbind('mousemove', docmousemove).unbind('mouseup', mouseup);
    }

    cursor.blink = $.noop;
    cursor.seek($(e.target), e.pageX, e.pageY);

    anticursor = new MathFragment(cursor.parent, cursor.prev, cursor.next);

    if (!editable) jQ.prepend(textareaSpan);

    jQ.mousemove(mousemove);
    $(document).mousemove(docmousemove).mouseup(mouseup);

    return false;
  });

  if (!editable) {
    jQ.bind('cut paste', false).bind('copy', setTextareaSelection)
      .prepend('<span class="selectable">$'+root.latex()+'$</span>');
    textarea.blur(function() {
      cursor.clearSelection();
      setTimeout(detach); //detaching during blur explodes in WebKit
    });
    function detach() {
      textareaSpan.detach();
    }
    return;
  }

  jQ.prepend(textareaSpan);

  //root CSS classes
  jQ.addClass('mathquill-editable');
  if (textbox)
    jQ.addClass('mathquill-textbox');

  //focus and blur handling
  textarea.focus(function(e) {
    blurred = false;
    if (!cursor.parent)
      cursor.appendTo(root);
    cursor.parent.jQ.addClass('hasCursor');
    if (cursor.selection) {
      cursor.selection.jQ.removeClass('blur');
      setTimeout(root.selectionChanged); //select textarea after focus
    }
    else
      cursor.show();
  }).blur(function(e) {
    blurred = true;
    cursor.hide().parent.blur();
    if (cursor.selection)
      cursor.selection.jQ.addClass('blur');
  }).blur();

  jQ.bind('mousedown.mathquill', function() {
    setTimeout(focus);
  }).bind('click.mathquill', focus); //stupid Mobile Safari
  function focus() {
    if (blurred)
      textarea.focus();
  }

  //clipboard event handling
  jQ.bind('cut', function(e) {
    setTextareaSelection();

    if (cursor.selection) {
      setTimeout(function() {
        cursor.deleteSelection();
        cursor.redraw();
      });
    }

    e.stopPropagation();
  })
  .bind('copy', function(e) {
    setTextareaSelection();
    e.stopPropagation();
  })
  //added by Eli to allow for custom paste content to be sent in from the outside
  .bind('custom_paste', function(e, str) {
    //removed by Eli -- this looks like a change that Han made to more cleanly fix the problem with copy breaking Safari
    //setting this to true meant that subsequent keystrokes would be ignored
    pasting = true;
    setTimeout(function(){paste(str)}, 0);
    e.stopPropagation();
  })
  .bind('paste', function(e) {
    pasting = true;
    setTimeout(paste);
    e.stopPropagation();
  })
  .bind('select_all', function(e) {
  	var cursor_parent = cursor.parent;
  	while (cursor_parent.parent)
  		cursor_parent = cursor_parent.parent;
	cursor.clearSelection().appendTo(cursor_parent);
	while (cursor.prev)
		cursor.selectLeft();
  });
  function paste(str) {
    //FIXME HACK the parser in RootTextBlock needs to be moved to
    //Cursor::writeLatex or something so this'll work with MathQuill textboxes
    //ADDED BY ELI: for some reason "1" is being passed in as the argument for str in paste
    var latex = (typeof str == "string" ? str : textarea.val());
    if (latex.slice(0,1) === '$' && latex.slice(-1) === '$') {
      latex = latex.slice(1, -1);
    }
  
    textarea.val('');
    //Hack by Eli -- don't exponentiate if there's nothing before the cursor?
    if ((latex == "^" || latex == "_") && !cursor.prev) {
    } else {

        //Hack #2 by Eli: if you type "+" or "-" or "=" in an exponent, break out of it?
        if ((latex == "+" || latex == "=" || latex == "-") && cursor.prev && cursor.parent && cursor.parent.parent && (cursor.parent.parent.cmd == "^")) {
            cursor.moveRight();
        }

        cursor.writeLatex(latex).show();
    
        if (cursor.root)
	       cursor.root.triggerSpecialEvent("render");
    }
    pasting = false;
  }

  //keyboard events and text input, see Wiki page "Keyboard Events"
  var lastKeydn, lastKeydnHappened, lastKeypressWhich, pasting=false;
  jQ.bind('keydown.mathquill', function(e) {
    lastKeydn = e;
    lastKeydnHappened = true;
    if (cursor.parent.keydown(e) === false)
      e.preventDefault();
  }).bind('keypress.mathquill', function(e) {
    if (lastKeydnHappened)
      lastKeydnHappened = false;
    else {
      //there's two ways keypress might be triggered without a keydown happening first:
      if (lastKeypressWhich !== e.which)
        //all browsers do that if this textarea is given focus during the keydown of
        //a different focusable element, i.e. by that element's keydown event handler.
        //No way of knowing original keydown, so ignore this keypress
        return;
      else
        //some browsers do that when auto-repeating key events, replay the keydown
        cursor.parent.keydown(lastKeydn);
    }
    lastKeypressWhich = e.which;

    //make sure setTextareaSelection() doesn't happen before textInput(), where we
    //check if any text was typed
    if (textareaSelectionTimeout !== undefined)
      clearTimeout(textareaSelectionTimeout);

    //after keypress event, trigger virtual textInput event if text was
    //input to textarea
    setTimeout(textInput);
  });

  function textInput() {
    if (pasting || (
      'selectionStart' in textarea[0]
      && textarea[0].selectionStart !== textarea[0].selectionEnd
    )) return;
    var text = textarea.val();
    
    
    
    
    if (text) {
        textarea.val('');

        //Hack by Eli -- don't exponentiate if there's nothing before the cursor?
        if ((text == "^" || text == "_") && !cursor.prev) {
            return;    
        }

        //Hack #2 by Eli: if you type "+" or "-" or "=" in an exponent, break out of it?
        if ((text == "+" || text == "=" || text == "-") && cursor.prev && cursor.parent && cursor.parent.parent && (cursor.parent.parent.cmd == "^")) {
            cursor.moveRight();
        }


      for (var i = 0; i < text.length; i += 1) {
        cursor.parent.textInput(text.charAt(i));
      }
    }
    else {
      if (cursor.selection || textareaSelectionTimeout !== undefined)
        setTextareaSelection();
    }
  }
}

function RootMathBlock(){}
_ = RootMathBlock.prototype = new MathBlock;
_.latex = function() {
  return MathBlock.prototype.latex.call(this).replace(/(\\[a-z]+) (?![a-z])/ig,'$1');
};
_.text = function() {
  return this.foldChildren('', function(text, child) {
    return text + child.text();
  });
};
_.renderLatex = function(latex) {
  var jQ = this.jQ;

  jQ.children().slice(1).remove();
  this.firstChild = this.lastChild = 0;

  // temporarily take the element out of the displayed DOM
  // while we add stuff to it.  Grab the next element or the parent
  // so we know where to put it back.
  var next = jQ.next(),
      parent = jQ.parent();

  jQ.detach();
  this.cursor.appendTo(this).writeLatex(latex, true);

  // Put. the element. back.
  // if there's no next element, it's at the end of its parent
  next.length ? next.before(jQ) : parent.append(jQ);

  // XXX HACK ALERT
  this.jQ.mathquill('redraw');
  this.blur();
};
_.keydown = function(e)
{
  e.ctrlKey = e.ctrlKey || e.metaKey;
  switch ((e.originalEvent && e.originalEvent.keyIdentifier) || e.which) {
  case 8: //backspace
  case 'Backspace':
  case 'U+0008':
    if (e.ctrlKey)
      while (this.cursor.prev || this.cursor.selection)
        this.cursor.backspace();
    else {
   	  if( this.isEmpty() )
        this.triggerSpecialEvent( "upwardDelete" );
      else
        this.cursor.backspace();
    }
    this.triggerSpecialEvent('render');
    break;
  case 27: //may as well be the same as tab until we figure out what to do with it
  case 'Esc':
  case 'U+001B':
  case 9: //tab
  case 'Tab':
  case 'U+0009':
    if (e.ctrlKey) break;

    var parent = this.cursor.parent;
    if (e.shiftKey) { //shift+Tab = go one block left if it exists, else escape left.
      if (parent === this.cursor.root) //cursor is in root editable, continue default
        return this.skipTextInput = true;
      else if (parent.prev) //go one block left
        this.cursor.appendTo(parent.prev);
      else //get out of the block
        this.cursor.insertBefore(parent.parent);
    }
    else { //plain Tab = go one block right if it exists, else escape right.
      if (parent === this.cursor.root) //cursor is in root editable, continue default
        return this.skipTextInput = true;
      else if (parent.next) //go one block right
        this.cursor.prependTo(parent.next);
      else //get out of the block
        this.cursor.insertAfter(parent.parent);
    }

    this.cursor.clearSelection();
    break;
  case 13: //enter
  case 'Enter':
  	this.triggerSpecialEvent( "enterPressed" );
    break;
  case 35: //end
  case 'End':
    if (e.shiftKey)
      while (this.cursor.next || (e.ctrlKey && this.cursor.parent !== this))
        this.cursor.selectRight();
    else //move to the end of the root block or the current block.
      this.cursor.clearSelection().appendTo(e.ctrlKey ? this : this.cursor.parent);
    break;
  case 36: //home
  case 'Home':
    if (e.shiftKey)
      while (this.cursor.prev || (e.ctrlKey && this.cursor.parent !== this))
        this.cursor.selectLeft();
    else //move to the start of the root block or the current block.
      this.cursor.clearSelection().prependTo(e.ctrlKey ? this : this.cursor.parent);
    break;
  case 37: //left
  case 'Left':
    if (e.ctrlKey) break;

    if (e.shiftKey)
      this.cursor.selectLeft();
    else
      this.cursor.moveLeft();
    break;
  case 38: //up
  case 'Up':
    if (e.ctrlKey || e.shiftKey) break;

    if (this.cursor.next.cmd === '\\sum ' || this.cursor.next.cmd === '\\prod ') //TODO: better architecture to not need a special case for these
      this.cursor.clearSelection().prependTo(this.cursor.next.lastChild);
    else if (this.cursor.prev.cmd === '\\sum ' || this.cursor.prev.cmd === '\\prod ')
      this.cursor.clearSelection().appendTo(this.cursor.prev.lastChild);
    else if (this.cursor.next instanceof Fraction)
      this.cursor.clearSelection().prependTo(this.cursor.next.firstChild);
    else if (this.cursor.prev instanceof Fraction)
      this.cursor.clearSelection().appendTo(this.cursor.prev.firstChild);
    else if (this.cursor.next.cmd === '^')
      this.cursor.clearSelection().prependTo(this.cursor.next.firstChild);
    else if (this.cursor.next && this.cursor.next.next.cmd === '^' && this.cursor.next.next.respaced)
      this.cursor.clearSelection().prependTo(this.cursor.next.next.firstChild);
    else {
      var ancestor = this.cursor.parent, ancestor_prev;
      while (ancestor && !ancestor_prev) {
        ancestor_prev = ancestor.prev;
        ancestor = ancestor.parent.parent;
      }
      if (ancestor_prev)
        this.cursor.clearSelection().appendTo(ancestor_prev);
      else
        this.triggerSpecialEvent('upPressed');
    }

    break;
  case 39: //right
  case 'Right':
    if (e.ctrlKey) break;

    if (e.shiftKey)
      this.cursor.selectRight();
    else
      this.cursor.moveRight();
    break;
  case 40: //down
  case 'Down':
    if (e.ctrlKey || e.shiftKey) break;

    if (this.cursor.next.cmd === '\\sum ' || this.cursor.next.cmd === '\\prod ') //TODO: better architecture to not need a special case for these
      this.cursor.clearSelection().prependTo(this.cursor.next.firstChild);
    else if (this.cursor.prev.cmd === '\\sum ' || this.cursor.prev.cmd === '\\prod ')
      this.cursor.clearSelection().appendTo(this.cursor.prev.firstChild);
    else if (this.cursor.next instanceof Fraction)
      this.cursor.clearSelection().prependTo(this.cursor.next.lastChild);
    else if (this.cursor.prev instanceof Fraction)
      this.cursor.clearSelection().appendTo(this.cursor.prev.lastChild);
    else if (this.cursor.next.cmd === '_')
      this.cursor.clearSelection().prependTo(this.cursor.next.firstChild);
    else if (this.cursor.next && this.cursor.next.next.cmd === '_' && this.cursor.next.next.respaced)
      this.cursor.clearSelection().prependTo(this.cursor.next.next.firstChild);
    else {
      var ancestor = this.cursor.parent, ancestor_next;
      while (ancestor && !ancestor_next) {
        ancestor_next = ancestor.next;
        ancestor = ancestor.parent.parent;
      }
      if (ancestor_next)
        this.cursor.clearSelection().prependTo(ancestor_next);
      else
        this.triggerSpecialEvent('downPressed');
    }

    break;
  case 46: //delete
  case 'Del':
  case 'U+007F':
    if (e.ctrlKey)
      while (this.cursor.next || this.cursor.selection)
        this.cursor.deleteForward();
    else {
          if( this.isEmpty() )
		  this.triggerSpecialEvent( "downwardDelete" );  
	  else
	      this.cursor.deleteForward();
    }
    this.triggerSpecialEvent('render');
    break;
  case 65: //the 'A' key, as in Ctrl+A Select All
  case 'A':
  case 'U+0041':
    if (e.ctrlKey && !e.shiftKey && !e.altKey) {
      if (this !== this.cursor.root) //so not stopPropagation'd at RootMathCommand
        return this.parent.keydown(e);

      this.cursor.clearSelection().appendTo(this);
      while (this.cursor.prev)
        this.cursor.selectLeft();
      break;
    }
  default:
    this.skipTextInput = false;
    return true;
  }
  this.skipTextInput = true;
  return false;
  
};
_.textInput = function(ch) {
  if (!this.skipTextInput) {
    this.cursor.write(ch);
	this.triggerSpecialEvent("render");
  }
};

//triggers a special event occured:
//	1) pressed up and was at 'top' of equation
//  2) pressed down and was at 'bottom' of equation
//  3) pressed backspace and equation was empty
//  4) the equation was rendered
//  5) etc
_.triggerSpecialEvent = function(eventName){
	var jQ = this.jQ;
	setTimeout( function(){ jQ.trigger(eventName)}, 1 );
}

function RootMathCommand(cursor) {
  this.init('$');
  this.firstChild.cursor = cursor;
  this.firstChild.textInput = function(ch) {
    if (this.skipTextInput) return;

    if (ch !== '$' || cursor.parent !== this)
      cursor.write(ch);
    else if (this.isEmpty()) {
      cursor.insertAfter(this.parent).backspace()
        .insertNew(new VanillaSymbol('\\$','$')).show();
    }
    else if (!cursor.next)
      cursor.insertAfter(this.parent);
    else if (!cursor.prev)
      cursor.insertBefore(this.parent);
    else
      cursor.write(ch);
  };
}
_ = RootMathCommand.prototype = new MathCommand;
_.html_template = ['<span class="mathquill-rendered-math"></span>'];
_.initBlocks = function() {
  this.firstChild =
  this.lastChild =
  this.jQ.data(jQueryDataKey).block =
    new RootMathBlock;

  this.firstChild.parent = this;
  this.firstChild.jQ = this.jQ;
};
_.latex = function() {
  return '$' + this.firstChild.latex() + '$';
};

function RootTextBlock(){}
_ = RootTextBlock.prototype = new MathBlock;
_.renderLatex = function(latex) {
  var self = this, cursor = self.cursor;
  self.jQ.children().slice(1).remove();
  self.firstChild = self.lastChild = 0;
  cursor.show().appendTo(self);

  latex = latex.match(/(?:\\\$|[^$])+|\$(?:\\\$|[^$])*\$|\$(?:\\\$|[^$])*$/g) || '';
  for (var i = 0; i < latex.length; i += 1) {
    var chunk = latex[i];
    if (chunk[0] === '$') {
      if (chunk[-1+chunk.length] === '$' && chunk[-2+chunk.length] !== '\\')
        chunk = chunk.slice(1, -1);
      else
        chunk = chunk.slice(1);

      var root = new RootMathCommand(cursor);
      cursor.insertNew(root);
      root.firstChild.renderLatex(chunk);
      cursor.show().insertAfter(root);
    }
    else {
      for (var j = 0; j < chunk.length; j += 1)
        this.cursor.insertNew(new VanillaSymbol(chunk[j]));
    }
  }
};
_.keydown = RootMathBlock.prototype.keydown;
_.textInput = function(ch) {
  if (this.skipTextInput) return;

  this.cursor.deleteSelection();
  if (ch === '$')
    this.cursor.insertNew(new RootMathCommand(this.cursor));
  else
    this.cursor.insertNew(new VanillaSymbol(ch));
};

