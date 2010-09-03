#include <node.h>
#include <node_buffer.h>
extern "C" {
#include <openssl/rc4.h>
}

using namespace v8;
using namespace node;


class RC4Encryption : public ObjectWrap {
public:
  static void Initialize(Handle<Object> target)
    {
      HandleScope scope;
      Local<FunctionTemplate> t1 = FunctionTemplate::New(New);
      Persistent<FunctionTemplate> t =
        Persistent<FunctionTemplate>::New(t1);
      t->InstanceTemplate()->SetInternalFieldCount(1);
      t->SetClassName(String::NewSymbol("RC4"));

      NODE_SET_PROTOTYPE_METHOD(t, "crypt", Crypt);
      NODE_SET_PROTOTYPE_METHOD(t, "encrypt", Crypt);
      NODE_SET_PROTOTYPE_METHOD(t, "decrypt", Crypt);

      target->Set(String::NewSymbol("RC4"), t->GetFunction());
    }

protected:
  /*** Constructor ***/

  static Handle<Value> New(const Arguments& args)
    {
      HandleScope scope;

      if (args.Length() == 1 &&
          Buffer::HasInstance(args[0]))
      {
        Buffer *key = ObjectWrap::Unwrap<Buffer>(args[0]->ToObject());
        RC4Encryption *self = new RC4Encryption(key);
        self->Wrap(args.This());

        return args.This();
      }
      else
        return ThrowException(Exception::TypeError(String::New("Bad argument.")));
    }

  RC4Encryption(Buffer *key)
    {
      RC4_set_key(&this->key, key->length(), reinterpret_cast<unsigned char *>(key->data()));
    }

  /*** crypt() ***/

  static Handle<Value> Crypt(const Arguments& args)
    {
      HandleScope scope;

      if (args.Length() == 2 &&
          Buffer::HasInstance(args[0]) &&
          Buffer::HasInstance(args[1]))
      {
        RC4Encryption *self = ObjectWrap::Unwrap<RC4Encryption>(args.This());
        Buffer *indata = ObjectWrap::Unwrap<Buffer>(args[0]->ToObject()),
          *outdata = ObjectWrap::Unwrap<Buffer>(args[1]->ToObject());

        if (indata->length() == outdata->length())
        {
          self->crypt(indata, outdata);
          return Null();
        }
        else
          return ThrowException(Exception::TypeError(String::New("Buffer size mismatch.")));
      }
      else
        return ThrowException(Exception::TypeError(String::New("Bad argument.")));
    }

      void crypt(Buffer *indata, Buffer *outdata)
      {
        RC4(&key, indata->length(),
            reinterpret_cast<unsigned char *>(indata->data()),
            reinterpret_cast<unsigned char *>(outdata->data()));
      }

private:
  RC4_KEY key;
};


extern "C" void init(Handle<Object> target)
{
  HandleScope scope;
  RC4Encryption::Initialize(target);
}
