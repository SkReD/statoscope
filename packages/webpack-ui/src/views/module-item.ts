import { NormalizedModule } from '@statoscope/webpack-model/types';
import { StatoscopeWidget } from '../../types';
// @ts-ignore
import style from './helpers.css';

export default function (discovery: StatoscopeWidget): void {
  discovery.view.define(
    'module-item',
    (
      el,
      config,
      data?: {
        showSize?: boolean;
        inline?: boolean;
        compact?: boolean;
        module: NormalizedModule;
      },
      context?,
    ) => {
      const { showSize = true, inline = false, compact = false } = data || {};

      el.classList.add(style.root);

      if (inline) {
        el.classList.add('inline-block');
      }

      discovery.view.render(
        el,
        [
          {
            view: 'badge',
            when: 'not module.moduleType~=/^asset\\/?/ and module.resolvedResource.fileType()',
            data: `
          $moduleResource:module.resolvedResource;
          {
            text: $moduleResource.fileExt(),
            color: $moduleResource.fileType().color(),
            hint: $moduleResource.fileType()
          }`,
          },
          {
            view: 'link',
            data: `{
            href: (module.id or module.identifier).pageLink("module", {hash:hash or #.params.hash}),
            text: module.resolvedResource or module.name or module.identifier,
            match: match
          }`,
            content: 'text-match',
          },
          {
            view: 'badge',
            data: `{
              $size: module.getModuleSize(hash or #.params.hash);
              text: $size.size.formatSize(),
              hint: $size.compressor or 'uncompressed'
            }`,
            when: !compact && showSize,
          },
          {
            view: 'badge',
            data: `{
            text: "+" + module.modules.size().pluralWithValue(['module', 'modules']),
            color: 40.colorFromH()
          }`,
            when: 'not compact and module.modules',
          },
          {
            view: 'badge',
            when: `not compact and module.moduleType~=/^asset\\/?/`,
            data: `{
            text: 'asset module',
            color: 40.colorFromH(),
            hint: module.moduleType
          }`,
          },
          {
            when: `not compact and (hash or #.params.hash).validation_getItems('module', module.identifier)`,
            view: 'validation-messages-badge',
            data: `{
              hash: hash or #.params.hash,
              type: 'module',
              id: module.identifier,
            }`,
          },
        ],
        data,
        context,
      );
    },
  );
}
