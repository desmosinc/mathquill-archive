/*********************************************************
 * The actual jQuery plugin and document ready handlers.
 ********************************************************/

//The publicy exposed method of jQuery.prototype, available (and meant to be
//called) on jQuery-wrapped HTML DOM elements.
$.fn.mathquill = function(cmd, latex) {
  switch (cmd) {
  case 'focus':
  case 'blur':
    return this.each(function() {
      var data = $(this).data(jQueryDataKey);
      data && data.block && data.block.textarea
        && data.block.textarea.children().trigger(cmd);
    });
  case 'redraw':
    return this.each(function() {
      var data = $(this).data(jQueryDataKey),
        block = data && data.block;
      (function postOrderRedraw(el) {
        el.eachChild(postOrderRedraw);
        if (el.redraw) el.redraw();
      }(block));
    });
  case 'revert':
    return this.each(function() {
      var data = $(this).data(jQueryDataKey);
      if (data && data.revert)
        data.revert();
    });
  case 'latex':
    if (arguments.length > 1) {
      return this.each(function() {
        var data = $(this).data(jQueryDataKey),
          block = data && data.block;
        if (block && block.renderLatex){
          block.renderLatex(latex);
          if (block.blurred)
            block.cursor.hide().parent.blur();
          block.triggerSpecialEvent( 'render' );
        }
      });
    }

    var data = this.data(jQueryDataKey);
    return data && data.block && data.block.latex();
  case 'text':
    var data = this.data(jQueryDataKey);
    return data && data.block && data.block.text();
  case 'html':
    return this.html().replace(/ ?hasCursor|hasCursor /, '')
      .replace(/ class=(""|(?= |>))/g, '')
      .replace(/<span class="?cursor( blink)?"?><\/span>/i, '')
      .replace(/<span class="?textarea"?><textarea><\/textarea><\/span>/i, '');
  case 'write':
    if (arguments.length > 1)
      return this.each(function() {
        var data = $(this).data(jQueryDataKey),
          block = data && data.block,
          cursor = block && block.cursor;

        if (cursor) {
          cursor.writeLatex(latex);
          if (block.blurred) {
            cursor.hide().parent.blur();
          }
        }
      });
  case 'cmd':
    if (arguments.length > 1)
      return this.each(function() {
        var data = $(this).data(jQueryDataKey),
          block = data && data.block,
          cursor = block && block.cursor;

        if (cursor) {
          cursor.show();
          if (/^\\[a-z]+$/i.test(latex)) {
            if (cursor.selection) {
              //gotta do cursor before cursor.selection is mutated by 'new cmd(cursor.selection)'
              cursor.prev = cursor.selection.prev;
              cursor.next = cursor.selection.next;
            }
            cursor.insertCmd(latex.slice(1), cursor.selection);
            delete cursor.selection;
          }
          else
            cursor.insertCh(latex);
          if (block.blurred)
            cursor.hide().parent.blur();
        }
      });
  case 'moveStart':
  	var data = this.data(jQueryDataKey);
  	if( data && data.block )
	   	data.block.cursor.prependTo( data.block );
  	break;
  case 'moveEnd':
    var data = this.data(jQueryDataKey);
  	if( data && data.block )
	   	data.block.cursor.appendTo( data.block );
  	break;
  case 'selection':
    var data = this.data(jQueryDataKey);
  	if( data && data.block )
      return data.block.cursor.selection ? '$'+data.block.cursor.selection.latex()+'$' : '';
    else
      return undefined;
  case 'clearSelection':
    return this.each(function() {
      var data = $(this).data(jQueryDataKey),
        block = data && data.block,
        cursor = block && block.cursor;
      if (cursor) {
        cursor.clearSelection();
        if (block.blurred)
          cursor.hide().parent.blur();
      }
    });
  default:
    var textbox = cmd === 'textbox',
      editable = textbox || cmd === 'editable',
      RootBlock = textbox ? RootTextBlock : RootMathBlock;
    return this.each(function() {
      createRoot($(this), new RootBlock, textbox, editable);
    });
  }
};

//on document ready, mathquill-ify all `<tag class="mathquill-*">latex</tag>`
//elements according to their CSS class.
$(function() {
  $('.mathquill-editable:not(.mathquill-rendered-math)').mathquill('editable');
  $('.mathquill-textbox:not(.mathquill-rendered-math)').mathquill('textbox');
  $('.mathquill-embedded-latex').mathquill();
});

