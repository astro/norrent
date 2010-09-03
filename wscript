srcdir = '.'
blddir = 'build'
VERSION = '0.0.0'

def set_options(opt):
  opt.tool_options('compiler_cxx')

def configure(conf):
  conf.check_tool('compiler_cxx')
  conf.check_tool('node_addon')

def build(bld):
  obj = bld.new_task_gen('cxx', 'shlib', 'node_addon')
  obj.target = 'dh'
  obj.source = 'dh.cc'
  obj.lib = 'ssl'

  obj = bld.new_task_gen('cxx', 'shlib', 'node_addon')
  obj.target = 'rc4'
  obj.source = 'rc4.cc'
  obj.lib = 'ssl'
